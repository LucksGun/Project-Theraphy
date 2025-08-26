import React, { useState, useEffect, ChangeEvent, useRef, useCallback, createContext, useContext } from 'react';
import ReactGA from 'react-ga4';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Barcode from 'react-barcode'; // ✨ NEW: Import for barcode generation
import './App.css';
import ChatbotPage from './ChatbotPage';
import AdminPage from './AdminPage';
import ConfirmClearCupGame from './ConfirmClearCupGame';
import PersonaPlinkoGame from './PersonaPlinkoGame';
import InterviewMode from './InterviewMode';
import PresentationPage from './PresentationPage';
import InvoiceManagerPage from './InvoiceManagerPage';
import lieDetectorImage from './LIE.jpg'; // Import the local image

// --- Firebase Imports ---
import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, Auth, User } from "firebase/auth";

// =================================================================
// --- 1. Firebase Configuration (firebase.ts) ---
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAhbxpAHqtZ62QSytUKW9ZwcUIOeh76DEc",
  authDomain: "project-theraphy.firebaseapp.com",
  databaseURL: "https://project-theraphy-default-rtdb.firebaseio.com",
  projectId: "project-theraphy",
  storageBucket: "project-theraphy.appspot.com",
  messagingSenderId: "674828852767",
  appId: "1:674828852767:web:5ddcb6accb5c681325bf2a"
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

// =================================================================
// --- 2. Authentication Context (AuthContext.tsx) ---
// =================================================================
// =================================================================
// --- 2. Authentication Context (AuthContext.tsx) ---
// =================================================================

// ✨ ADD THIS INTERFACE
export interface DbUser {
  id: string;
  firebase_uid: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
}

// 🔧 MODIFY THIS INTERFACE
interface AuthContextType {
  user: User | null;
  dbUser: DbUser | null; // ✨ ADD THIS LINE
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null); // ✨ ADD THIS LINE
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // ✨ ADD THIS IF-STATEMENT
      if (!currentUser) {
        setDbUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ✨ ADD THIS ENTIRE useEffect BLOCK
  useEffect(() => {
    const fetchDbUser = async () => {
      if (user) {
        setLoading(true);
        try {
          const token = await user.getIdToken();
          const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getUserProfile', token })
          });
          if (!response.ok) throw new Error('Failed to fetch user profile');
          const data = await response.json();
          if (data.success && data.user) {
            setDbUser(data.user);
          } else {
            setDbUser(null);
          }
        } catch (error) {
          console.error("Error fetching DB user profile:", error);
          setDbUser(null);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchDbUser();
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseIdToken = await result.user.getIdToken();
      
      await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'loginWithFirebase',
          token: firebaseIdToken
        })
      });
    } catch (error) {
      console.error("Firebase login error:", error);
      alert("Failed to login with Google.");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Firebase logout error:", error);
    }
  };

  // 🔧 MODIFY THIS LINE
  const value = { user, dbUser, loading, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// =================================================================
// --- 3. Main Application Logic (App.tsx) ---
// =================================================================

// --- GA Initialization ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";
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

// --- Types & Interfaces ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; }
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
export interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
export interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }
export interface FeedbackItem { id: number; email: string | null; rating: number; comment: string; submitted_at: string; is_important: number; }
export type PersonaInstructionMap = { [key in Persona]?: string };
export type AppTheme = 'light' | 'dark';

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey';
const PERSONA_STORAGE_KEY = 'selectedPersona';
const THEME_STORAGE_KEY = 'selectedAppTheme';
const WELCOME_SEEN_KEY = 'welcomePageSeenV1';

// --- Configurations ---
export const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', restricted: false },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', restricted: false },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', restricted: true }
];
export const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);

export interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
export const AVAILABLE_PERSONAS: PersonaInfo[] = [
    { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false },
    { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true },
    { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true }
];
export const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
export const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';
export const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
export const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);

export const DEFAULT_BASE_SYSTEM_INSTRUCTION = `You are a helpful AI assistant. Format responses using Markdown. Provide suggestions for general topics like [Suggestion: Suggestion Text]. Avoid this format for sensitive personal advice. Respond in Thai if user uses Thai. Offer inspirational quotes if user feels down. If input starts with "Field 1:", analyze for university advice based only on fields 1-5. Adopt a friendly and conversational tone. Avoid overly formal language. Respond like a helpful human assistant.`;
export const DEFAULT_PERSONA_INSTRUCTIONS: PersonaInstructionMap = {
    normal: `Act as a general assistant. Use [Suggestion: ...] for follow-ups on general topics.`,
    therapist: `Roleplay as an empathetic therapist assistant. Use gentle, validating language. Do NOT give medical advice. Ask gentle questions or suggest coping mechanisms in PLAIN TEXT, not [Suggestion:...]. Prioritize inspirational quotes for distress.`,
    university_master: `Roleplay as an expert academic advisor. Focus on university/career topics. Use [Suggestion: ...] for general academic questions. Provide detailed recommendations for "Field 1-5" input.`
};
export const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);

// --- API ---
export interface ApiRequestBody {
    action: string;
    prompt?: string;
    model?: GeminiModel;
    persona?: Persona;
    imageMimeType?: string;
    imageDataUrl?: string;
    accessKey?: string;
    history?: any[];
    staffKey?: string;
    key?: string;
    newStatus?: 'active' | 'inactive';
    models?: GeminiModel[];
    personas?: Persona[];
    username?: string | null;
    newUsername?: string | null;
    email?: string | null;
    rating?: number;
    comment?: string;
    feedbackId?: number;
    isImportant?: boolean | number;
    baseInstruction?: string;
    personaInstructions?: PersonaInstructionMap;
    fileId?: string;
    token?: string | null;
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
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    }
    return 'light';
};


// --- User Profile & Login Button Components ---
const UserProfile: React.FC<{ onProfileClick: () => void }> = ({ onProfileClick }) => {
    const { user, logout } = useAuth();
    if (!user) return null;

    return (
        <div onClick={onProfileClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} title="View User Info">
            <img 
                src={user.photoURL || undefined} 
                alt={user.displayName || 'User'} 
                style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            />
            <button 
                onClick={(e) => {
                    e.stopPropagation(); // Prevent modal from opening when clicking logout
                    logout();
                }} 
                className="settings-button" 
                title="Logout"
            >
                Logout
            </button>
        </div>
    );
};

const LoginButton: React.FC = () => {
    const { login } = useAuth();
    return (
        <button onClick={login} className="settings-button" title="Login with Google">
            Login
        </button>
    );
};


// --- MainApp Component ---
function MainApp() {
    const { user, loading } = useAuth();
    
    // --- State ---
    const [messages, setMessages] = useState<Message[]>([]);
    const [showWelcomePage, setShowWelcomePage] = useState<boolean>(false);
    const [showKnowledgeCheck, setShowKnowledgeCheck] = useState<boolean>(false);
    const [showLieDetector, setShowLieDetector] = useState<boolean>(false);
    const [showTutorial, setShowTutorial] = useState<boolean>(false);
    const [isFanOn, setIsFanOn] = useState(true);
    const [buttonTransform, setButtonTransform] = useState('translate(0, 0)');
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash');
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
        const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
        if (stored && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(stored)) {
            return stored;
        }
        return 'en-US';
    });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
    const [isInterviewModeOpen, setIsInterviewModeOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
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
    const [isUserInfoModalVisible, setIsUserInfoModalVisible] = useState<boolean>(false); // ✨ NEW

    const navigate = useNavigate();

    // --- Calculate derived state ---
    const availablePersonasForGame = AVAILABLE_PERSONAS.filter(p => !p.restricted || keyStatus.isValid === true);
    const canChangePersona = keyStatus.isValid === true && availablePersonasForGame.length >= 1;
    const canAccessAdvanced = keyStatus.isValid === true;

    // --- Effects ---
    useEffect(() => {
        if (loading) {
            return;
        }
        
        const loadChatData = async () => {
            if (user) {
                try {
                    const token = await user.getIdToken();
                    const response = await fetch(WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'getChatHistory', token })
                    });
                    if (!response.ok) throw new Error('Failed to fetch chat history');
                    
                    const data = await response.json();
                    if (data.history && data.history.length > 0) {
                        const loadedMessages = data.history.map((item: any, index: number) => ({
                            id: Date.now() + index,
                            text: item.parts[0].text,
                            sender: item.role === 'user' ? 'user' : 'bot',
                            timestamp: Date.now() + index,
                        }));
                        setMessages(loadedMessages);
                    } else {
                        const ts = Date.now();
                        setMessages([{ id: ts, text: `Welcome back, ${user.displayName || 'User'}!`, sender: 'bot', timestamp: ts }]);
                    }
                } catch (error) {
                    console.error("Error loading DB chat history:", error);
                    const ts = Date.now();
                    setMessages([{ id: ts, text: "Welcome! Couldn't load previous chat.", sender: 'bot', timestamp: ts }]);
                }
            } else {
                const stored = localStorage.getItem(CHAT_STORAGE_KEY);
                try {
                    const initial = stored && stored !== '[]' ? JSON.parse(stored) : [];
                    if (Array.isArray(initial) && initial.length > 0) {
                        setMessages(initial.filter(m => m.sender !== 'loading'));
                    } else {
                        const ts = Date.now();
                        setMessages([{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]);
                    }
                } catch (e) {
                    console.error("Bad stored msgs:", e);
                    localStorage.removeItem(CHAT_STORAGE_KEY);
                    const ts = Date.now();
                    setMessages([{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]);
                }
            }
        };

        loadChatData();
    }, [user, loading]);


    useEffect(() => {
        const keyTrimmed = enteredKey.trim();
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        const currentModelBeforeValidation = selectedModel;
        const currentPersonaBeforeValidation = selectedPersona;

        if (!keyTrimmed) {
            setKeyStatus({ isValid: null, username: null, loading: false, error: null });
            if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash');
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
                    if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash');
                    if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Validation network error.";
                setKeyStatus({ isValid: false, username: null, loading: false, error: msg });
                if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash');
                if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
            }
        }, VALIDATION_DEBOUNCE_MS);

        return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
    }, [enteredKey]);

    useEffect(() => {
        const welcomeSeen = localStorage.getItem(WELCOME_SEEN_KEY);
        if (welcomeSeen !== 'true') {
            setShowWelcomePage(true);
        }

        const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
        const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
        const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
        let initialModel: GeminiModel = 'gemini-2.5-flash';
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
                        if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.5-flash');
                        if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                    }
                } catch (e) {
                    setKeyStatus({ isValid: false, username: null, loading: false, error: 'Validation failed' });
                    if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.5-flash');
                    if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            };
            validateInitialKey(initialKey, initialModel, initialPersona);
        } else {
            if (RESTRICTED_MODELS_VALUES.includes(initialModel)) setSelectedModel('gemini-2.5-flash');
            if (RESTRICTED_PERSONAS_VALUES.includes(initialPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
        }
    }, []);

    useEffect(() => {
        if (!user) {
            const messagesToSave = messages.filter(m => m.sender !== 'loading');
            if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) {
                localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave));
            } else if (messagesToSave.length === 0 || (messagesToSave.length === 1 && messagesToSave[0].sender === 'bot' && messagesToSave[0].text === "Chat cleared.")) {
                localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([]));
            }
        }
    }, [messages, user]);

    useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
    useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
    useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
    useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);
    useEffect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
        document.documentElement.setAttribute('data-theme', currentTheme);
    }, [currentTheme]);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (feedbackSuccess) {
            timer = setTimeout(() => setFeedbackSuccess(null), 3000);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [feedbackSuccess]);

    // --- Event Handlers ---
    const closeAllModals = () => {
        setIsSettingsOpen(false);
        setIsAdvancedSettingsOpen(false);
        setIsStaffLoginModalVisible(false);
        setIsFeedbackModalVisible(false);
        setIsClearCupGameVisible(false);
        setIsPersonaPlinkoVisible(false);
        setIsInterviewModeOpen(false);
        setShowKnowledgeCheck(false);
        setShowLieDetector(false);
        setShowTutorial(false);
        setIsUserInfoModalVisible(false); // ✨ NEW
    };

    const toggleUserInfoModal = () => { // ✨ NEW
        const currentlyVisible = isUserInfoModalVisible;
        closeAllModals();
        if (!currentlyVisible) {
            setIsUserInfoModalVisible(true);
        }
    };

    const handleAcceptWelcome = () => {
        localStorage.setItem(WELCOME_SEEN_KEY, 'true');
        setShowWelcomePage(false);
        setShowKnowledgeCheck(true);
    };

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
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (e) {
            console.error("Error playing beep:", e);
        }
    };

    const handleYesClick = () => {
        setShowLieDetector(true);
        playBeep();
        setTimeout(() => {
            setShowLieDetector(false);
        }, 2000);
    };

    const handleNoClick = () => {
        setShowKnowledgeCheck(false);
        setShowTutorial(true);
    };

    const handleEnterChatbot = () => {
        if (!isFanOn) {
            setShowTutorial(false);
            navigate('/');
        }
    };

    const handleWindEffect = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isFanOn) {
            const zone = e.currentTarget;
            const button = zone.querySelector('button');
            if (!button) return;
            const zoneRect = zone.getBoundingClientRect();
            const cursorX = e.clientX - zoneRect.left;
            const pushStrength = 40;
            const moveX = - (zoneRect.width - cursorX) / zoneRect.width * pushStrength;
            setButtonTransform(`translateX(${moveX}px)`);
        }
    };

    const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => { setSttLang(e.target.value as SpeechLanguage); };
    const toggleSettings = () => { const currentlyVisible = isSettingsOpen; closeAllModals(); if (!currentlyVisible) { setIsSettingsOpen(true); } };
    const toggleAdvancedSettings = () => { const currentlyVisible = isAdvancedSettingsOpen; closeAllModals(); if (!currentlyVisible) { setIsAdvancedSettingsOpen(true); } }
    const openAdvancedSettingsFromMain = () => { setIsSettingsOpen(false); setIsAdvancedSettingsOpen(true); };
    const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => { const newModel = event.target.value as GeminiModel; setSelectedModel(newModel); };
    const openInterviewMode = () => { closeAllModals(); setIsInterviewModeOpen(true); };
    const closeInterviewMode = () => { setIsInterviewModeOpen(false); };
    
    const executeClearChat = async () => {
        console.log("Executing clear chat logic after confirmation.");
        closeAllModals();
        
        const timestamp = Date.now();
        const clearMessage: Message = { id: timestamp, text: "Chat cleared.", sender: 'bot', timestamp: timestamp };
        setMessages([clearMessage]);

        if (user) {
            try {
                const token = await user.getIdToken();
                const response = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clearChatHistory', token })
                });
                if (!response.ok) {
                    throw new Error("Failed to clear history on the server.");
                }
                console.log("Database chat history cleared successfully.");
            } catch (error) {
                console.error("Could not clear DB history:", error);
                alert("Could not clear your saved chat history. Please try again.");
            }
        } else {
            localStorage.removeItem(CHAT_STORAGE_KEY);
            console.log("Guest chat history cleared from localStorage.");
        }
    };
    
    const handleAccessKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredKey(e.target.value); };
    const handleExportChat = () => {
        const msgs = messages.filter(m => m.sender !== 'loading');
        if (msgs.length === 0 || (msgs.length === 1 && msgs[0].sender === 'bot' && msgs[0].text === "Welcome!")) {
            alert("Chat is empty or only contains the welcome message.");
            return;
        }
        let c = `Chat Export\nTimestamp: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid ? keyStatus.username : 'N/A (No valid key)'}\nTheme: ${currentTheme}\n----\n\n`;
        msgs.forEach(m => {
            const t = new Date(m.timestamp).toLocaleString();
            c += `[${t}] ${m.sender === 'user' ? 'User' : 'Bot'}:\n${m.text}\n${m.imageUrl ? `(Image Attachment: ${m.imageUrl.substring(0, 50)}...)\n` : ''}\n`;
        });
        try {
            const b = new Blob([c], { type: 'text/plain;charset=utf-8' });
            const u = URL.createObjectURL(b);
            const a = document.createElement('a');
            const f = `theraphy-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            a.href = u;
            a.download = f;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(u);
            if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") ReactGA.event({ category: "Chat", action: "Export", label: `Msg Count: ${msgs.length}` });
            closeAllModals();
        } catch (e) {
            console.error("Export failed:", e);
            alert("Failed to export chat.");
        }
    };
    const toggleStaffLoginModal = () => {
        const currentlyVisible = isStaffLoginModalVisible;
        closeAllModals();
        if (!currentlyVisible) {
            setIsStaffLoginModalVisible(true);
        } else {
            setEnteredStaffKey('');
            setStaffLoginError(null);
        }
    };
    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); setStaffLoginError(null); };
    const handleStaffLogin = async () => {
        if (!enteredStaffKey.trim()) {
            setStaffLoginError("Staff key is required.");
            return;
        }
        setIsStaffLoginLoading(true);
        setStaffLoginError(null);
        try {
            const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) });
            const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server.' }));
            if (!res.ok || !data.isValid) {
                throw new Error(data?.error || `Login Failed (Status: ${res.status})`);
            }
            sessionStorage.setItem('staffKey', enteredStaffKey);
            closeAllModals();
            setEnteredStaffKey('');
            navigate('/admin');
        } catch (e) {
            setStaffLoginError(e instanceof Error ? e.message : "Login failed due to an unknown error.");
            sessionStorage.removeItem('staffKey');
        } finally {
            setIsStaffLoginLoading(false);
        }
    };
    const toggleFeedbackModal = () => {
        const currentlyVisible = isFeedbackModalVisible;
        closeAllModals();
        if (!currentlyVisible) {
            setIsFeedbackModalVisible(true);
        } else {
            setFeedbackEmail('');
            setFeedbackRating(0);
            setFeedbackComment('');
            setFeedbackError(null);
            setFeedbackSuccess(null);
            setIsSubmittingFeedback(false);
        }
    };
    const handleFeedbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (feedbackRating === 0) { setFeedbackError("Please select a star rating."); return; }
        if (!feedbackComment.trim()) { setFeedbackError("Please provide a comment."); return; }
        if (feedbackComment.length > 2000) { setFeedbackError("Comment is too long (max 2000 characters)."); return; }
        setIsSubmittingFeedback(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        const payload: ApiRequestBody = { action: 'submitFeedback', email: feedbackEmail.trim() || null, rating: feedbackRating, comment: feedbackComment.trim() };
        try {
            const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));
            if (!res.ok || !data.success) {
                throw new Error(data?.error || `Submit failed: ${res.statusText}`);
            }
            setFeedbackSuccess("Thank you! Your feedback has been submitted.");
            setFeedbackEmail('');
            setFeedbackRating(0);
            setFeedbackComment('');
            if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
                ReactGA.event({ category: "Feedback", action: "Submit", label: `Rating: ${feedbackRating}` });
            }
        } catch (err) {
            setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback.");
        } finally {
            setIsSubmittingFeedback(false);
        }
    };
    const toggleTheme = useCallback(() => { setCurrentTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light')); }, []);
    const openPersonaPlinko = () => { if (!canAccessAdvanced) return; setIsAdvancedSettingsOpen(false); setIsPersonaPlinkoVisible(true); }
    const openClearCupGame = () => { setIsSettingsOpen(false); setIsClearCupGameVisible(true); }
    const handlePersonaSelectedFromPlinko = (persona: Persona) => { setSelectedPersona(persona); setIsPersonaPlinkoVisible(false); };
    
    // --- JSX ---
    if (loading) {
        return <div>Loading Application...</div>;
    }
    
    return (
        <div className="App">
            <style>{`
                /* ... (your existing tutorial/fan styles) ... */
            `}</style>

            {/* Onboarding Flow */}
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
            {showKnowledgeCheck && ( 
                <div className="knowledge-check-overlay">
                    {!showLieDetector && !showTutorial && (
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
                            <img src={lieDetectorImage} alt="Lie Detector" className="lie-detector-image" />
                        </div>
                    )}
                </div> 
            )}
            {showTutorial && ( 
                <div className="tutorial-modal-overlay">
                    <div className="tutorial-modal">
                        <div className="tutorial-interaction-area">
                            <div className="fan-and-button-container">
                                <div className={`wind-effect ${isFanOn ? 'blowing' : ''}`}></div>
                                <div 
                                    className="button-wind-zone"
                                    onMouseMove={handleWindEffect}
                                    onMouseLeave={() => setButtonTransform('translate(0,0)')}
                                >
                                    <button
                                        className="tutorial-enter-button"
                                        onClick={handleEnterChatbot}
                                        style={{ transform: buttonTransform, transition: 'transform 0.1s ease-out' }}
                                    >
                                        Enter Chatbot Page
                                    </button>
                                </div>
                                <div className={`interactive-fan ${isFanOn ? 'spinning' : ''}`}>
                                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="#666" strokeWidth="5" />
                                    <g className="fan-blades" style={{ transformOrigin: '50% 50%' }}>
                                        <rect x="45" y="10" width="10" height="40" rx="5" fill="#999" transform="rotate(0 50 50)" />
                                        <rect x="45" y="10" width="10" height="40" rx="5" fill="#999" transform="rotate(120 50 50)" />
                                        <rect x="45" y="10" width="10" height="40" rx="5" fill="#999" transform="rotate(240 50 50)" />
                                    </g>
                                    <circle cx="50" cy="50" r="8" fill="#666" />
                                    </svg>
                                </div>
                            </div>
                        </div>
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
                        <div className="fan-controls">
                            <label className="fan-switch">
                                <input type="checkbox" checked={!isFanOn} onChange={() => setIsFanOn(!isFanOn)} />
                                <span className="slider round"></span>
                            </label>
                            <span>Turn Off Fan To Enter</span>
                        </div>
                    </div>
                </div> 
            )}

            {/* Main App and Modals */}
            {!showWelcomePage && !showKnowledgeCheck && !showTutorial && (
            <>
                {isSettingsOpen && ( 
                    <div className="settings-menu" role="dialog" aria-labelledby="settings-title">
                        <h3 id="settings-title">Settings</h3>
                        <div className="settings-column" style={{ gap: '20px' }}>
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
                                <label>Appearance:</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button onClick={toggleTheme} id="theme-toggle" className="settings-action-button theme-toggle-button">
                                        {currentTheme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode'}
                                    </button>
                                </div>
                            </div>
                            <div className="settings-option">
                                <label>Chat Actions:</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button>
                                    <button onClick={openClearCupGame} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat History</button>
                                </div>
                            </div>
                            <div className="settings-option">
                                <label>Advanced Configuration:</label>
                                <button
                                    onClick={() => { openAdvancedSettingsFromMain(); }}
                                    className="settings-action-button advanced-settings-trigger-button"
                                    title="Configure Model, Persona & Key"
                                >
                                    🔑 Advanced Settings...
                                </button>
                            </div>
                            <div className="settings-option">
                                <label>Admin Area:</label>
                                <button onClick={toggleStaffLoginModal} className="settings-action-button staff-area-button">🔑 Staff Login</button>
                            </div>
                        </div>
                        <hr className="settings-separator" />
                        <button onClick={toggleSettings} className="close-settings-button">Close Settings</button>
                    </div> 
                )}
                {isAdvancedSettingsOpen && ( 
                    <div className="settings-menu advanced-settings-modal" role="dialog" aria-labelledby="advanced-settings-title">
                        <h3 id="advanced-settings-title">Advanced Settings</h3>
                        <div className="settings-column" style={{ gap: '20px' }}>
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
                            <div className="settings-option">
                                <label htmlFor="model-select-adv">AI Model:</label>
                                <select
                                    id="model-select-adv"
                                    className="settings-select"
                                    value={selectedModel}
                                    onChange={handleModelChange}
                                    aria-label="Select AI Model"
                                >
                                    {ALL_AVAILABLE_MODELS_FRONTEND.map(modelInfo => {
                                        const isDisabled = modelInfo.restricted && !keyStatus.isValid;
                                        return (
                                            <option
                                                key={modelInfo.value}
                                                value={modelInfo.value}
                                                disabled={isDisabled}
                                                style={isDisabled ? { color: 'grey' } : {}}
                                            >
                                                {modelInfo.label}{isDisabled ? ' (Requires Key)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                                {RESTRICTED_MODELS_VALUES.length > 0 && !keyStatus.isValid && (
                                    <p className="settings-helper-text">
                                        Enter a valid Access Key to use restricted models.
                                    </p>
                                )}
                            </div>
                        </div>
                        <hr className="settings-separator" />
                        <button onClick={toggleAdvancedSettings} className="close-settings-button">Close Advanced</button>
                    </div> 
                )}
                {isStaffLoginModalVisible && ( 
                    <div className="staff-panel-overlay">
                        <div className="staff-panel-modal" style={{ maxWidth: '400px' }}>
                            <h3 id="staff-login-title">Staff Login</h3>
                            <button onClick={toggleStaffLoginModal} className="close-staff-panel-button" title="Close Login">×</button>
                            <form onSubmit={(e) => { e.preventDefault(); handleStaffLogin(); }} className="staff-login-section">
                                <div className="settings-option">
                                    <label htmlFor="staff-key-modal-input">Staff Key:</label>
                                    <input type="password" id="staff-key-modal-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff access key" disabled={isStaffLoginLoading} autoFocus required />
                                </div>
                                <button type="submit" className="staff-login-button" disabled={isStaffLoginLoading || !enteredStaffKey.trim()}>{isStaffLoginLoading ? 'Verifying...' : 'Login & Enter Admin'}</button>
                                {staffLoginError && <p className="staff-error">{staffLoginError}</p>}
                                <p className="staff-security-warning">Enter key to access admin page.</p>
                            </form>
                        </div>
                    </div> 
                )}
                {isInterviewModeOpen && ( <InterviewMode isOpen={isInterviewModeOpen} onClose={closeInterviewMode} selectedModel={selectedModel} accessKey={enteredKey} sttLang={sttLang} /> )}
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
                                        <input type="email" id="feedback-email" className="settings-input" value={feedbackEmail} onChange={(e) => setFeedbackEmail(e.target.value)} placeholder="your.email@example.com" maxLength={250} disabled={isSubmittingFeedback} />
                                    </div>
                                    <div className="feedback-field">
                                        <label>Rating:<span style={{ color: 'red' }}>*</span></label>
                                        <div className="star-rating">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <button key={star} type="button" aria-pressed={star === feedbackRating} className={`star-button ${star <= feedbackRating ? 'selected' : ''}`} onClick={() => setFeedbackRating(star)} disabled={isSubmittingFeedback} aria-label={`Rate ${star}/5`}>★</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="feedback-field">
                                        <label htmlFor="feedback-comment">Comment:<span style={{ color: 'red' }}>*</span></label>
                                        <textarea id="feedback-comment" className="settings-input" rows={5} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Tell us about your experience, suggestions, or any bugs..." maxLength={2000} required disabled={isSubmittingFeedback} />
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
                {isPersonaPlinkoVisible && (<PersonaPlinkoGame isOpen={isPersonaPlinkoVisible} onClose={() => setIsPersonaPlinkoVisible(false)} onPersonaSelected={handlePersonaSelectedFromPlinko} keyStatus={keyStatus} allPersonas={AVAILABLE_PERSONAS} />)}
                {isClearCupGameVisible && (<ConfirmClearCupGame isOpen={isClearCupGameVisible} onClose={() => setIsClearCupGameVisible(false)} onConfirm={executeClearChat} />)}

                {/* ✨ NEW: User Info Modal */}
                {isUserInfoModalVisible && user && (
                    <div className="settings-menu" role="dialog" aria-labelledby="user-info-title">
                        <h3 id="user-info-title">User Information</h3>
                        <div className="settings-column" style={{ alignItems: 'center', gap: '15px' }}>
                            <img 
                                src={user.photoURL || undefined} 
                                alt={user.displayName || 'User'} 
                                className="user-info-avatar"
                            />
                            <div style={{ textAlign: 'center' }}>
                                <p className="user-info-name">{user.displayName}</p>
                                <p className="user-info-email">{user.email}</p>
                            </div>
                            
                            <div className="user-info-box">
                                <label className="user-info-label">User ID</label>
                                <p className="user-info-uid">{user.uid}</p>
                                <div className="user-info-barcode-container">
                                    <Barcode 
                                        value={user.uid} 
                                        width={1.5}
                                        height={50}
                                        displayValue={false}
                                        background="transparent"
                                        lineColor={currentTheme === 'dark' ? '#FFFFFF' : '#000000'}
                                    />
                                </div>
                            </div>

                            <div className="user-info-box">
                                <label className="user-info-label">Stored Chat Data</label>
                                <p className="user-info-data">
                                    <strong>{messages.length}</strong> messages
                                </p>
                                <p className="user-info-data-size">
                                    Approx. <strong>{(JSON.stringify(messages).length / 1024).toFixed(2)} KB</strong>
                                </p>
                            </div>
                        </div>
                        
                        <hr className="settings-separator" />
                        <button onClick={toggleUserInfoModal} className="close-settings-button">Close</button>
                    </div>
                )}


                {/* Main Routing and Layout */}
                <Routes>
                    <Route path="/" element={
                        <>
                            <header className="App-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button>
                                    <button onClick={toggleFeedbackModal} className="settings-button" title="Submit Feedback">💬</button>
                                </div>
                                <h1>Project Theraphy</h1>
                                <div className="header-spacer-right">
                                    {user ? <UserProfile onProfileClick={toggleUserInfoModal} /> : <LoginButton />}
                                </div>
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
                    <Route path="/admin" element={ <ProtectedRoute> <AdminPage /> </ProtectedRoute> } />
                    <Route path="/present" element={<PresentationPage />} />
                    <Route path="/pay" element={<InvoiceManagerPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </>
            )}
        </div>
    );
}

// --- Final App Component with AuthProvider ---
function App() {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
}

export default App;
