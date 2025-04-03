// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface
export interface Message { /* ... */ }

// Define allowed model types (All possible models)
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash';

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';

// localStorage Keys
const CHAT_STORAGE_KEY = 'chatMessages'; /* ... other keys ... */
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const BETA_ACCEPTED_KEY = 'betaAccepted';

// --- Configuration for Model Display ---
interface ModelInfo {
  value: GeminiModel;
  label: string;
  restricted: boolean;
}

const ALL_AVAILABLE_MODELS: ModelInfo[] = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', restricted: false },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', restricted: true }, // Restricted
  { value: 'gemini-2.5-pro-exp', label: 'Gemini 2.5 Pro Exp', restricted: true } // Restricted
];

const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS
  .filter(m => m.restricted)
  .map(m => m.value);

// !! IMPORTANT: Storing secrets directly in frontend code is insecure !!
// Replace this with a secure way to manage access if needed for production.
// This key should match the value expected by the Cloudflare Worker.
const USER_PROVIDED_ACCESS_KEY = "super_secret_password_123"; // Example - how does the user provide this? Or is it hardcoded?
const REQUIRED_ACCESS_KEY = "super_secret_password_123"; // This ideally matches the worker env.ACCESS_KEY value


function App() {
  // --- State Variables ---
  const [messages, setMessages] = useState<Message[]>(() => { /* ... */ return []; });
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);

  // Determine if the user has the 'key' to see restricted models
  // In a real app, this would involve checking authentication/roles
  const userHasAccessToRestricted = USER_PROVIDED_ACCESS_KEY === REQUIRED_ACCESS_KEY;

  // Model Selection State & Persistence
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
    // Check if saved model is valid *and* allowed for this user
    if (savedModel && ALL_AVAILABLE_MODELS.some(m => m.value === savedModel)) {
        // Is it restricted?
        if (RESTRICTED_MODELS_VALUES.includes(savedModel)) {
             // Only allow if user has access
             if (userHasAccessToRestricted) {
                 return savedModel;
             } else {
                 // User doesn't have access to the saved restricted model, fallback
                 console.warn(`Saved model ${savedModel} is restricted, falling back to default.`);
                 return 'gemini-2.0-flash'; // Default non-restricted
             }
        } else {
            // Not restricted, allow it
            return savedModel;
        }
    }
    return 'gemini-2.0-flash'; // Default model
  });

  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { /* ... */ return 'en-US'; });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- Effects ---
  useEffect(() => { /* ... */ }, [messages]);
  useEffect(() => { /* ... */ }, []);
  // Ensure selected model persists, even if restricted (worker will block if needed)
  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  useEffect(() => { /* ... */ }, [sttLang]);

  // --- Event Handlers ---
  const handleAcceptBeta = () => { /* ... */ };
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      // Basic check: Ensure the selected value is one we generally allow
      if (ALL_AVAILABLE_MODELS.some(m => m.value === newModel)) {
          setSelectedModel(newModel);
      } else {
          console.error(`Attempted to select invalid model: ${newModel}`);
      }
  };
  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => { /* ... */ };
  const toggleSettings = () => { setIsSettingsOpen(prev => !prev); };
  const handleClearChat = () => { /* ... */ };

  // --- (Include full state init logic and handlers here) ---


  // --- JSX Return ---
  return (
    <div className="App">
      {/* Settings Button */}
      {/* (Rendered in header) */}

      {/* --- Settings Menu --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>

          {/* STT Language Selector */}
          <div className="settings-option">{/* ... Language select ... */}</div>

          {/* Model Selector - Conditionally Rendered Options */}
          <div className="settings-option">
            <label htmlFor="model-select">AI Model:</label>
            <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select">
                {/* Map over ALL models, but only render if not restricted OR user has access */}
                {ALL_AVAILABLE_MODELS.map((modelInfo) => {
                    // Render if the model is not restricted OR if the user has access key
                    if (!modelInfo.restricted || userHasAccessToRestricted) {
                        return (
                            <option key={modelInfo.value} value={modelInfo.value}>
                                {modelInfo.label}
                                {modelInfo.restricted ? ' (Restricted)' : ''} {/* Optional label */}
                            </option>
                        );
                    }
                    // Otherwise, render nothing for this restricted option
                    return null;
                })}
            </select>
             {/* Optionally show a message if restricted models are hidden */}
             {!userHasAccessToRestricted && RESTRICTED_MODELS_VALUES.length > 0 && (
                <p style={{fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '5px'}}>
                    Some models require special access.
                </p>
             )}
          </div>

          {/* Clear Chat History Button */}
          <div className="settings-option">{/* ... Clear chat button ... */}</div>

          {/* Separator Line */}
          <hr className="settings-separator" />

          {/* Close Button */}
          <button onClick={toggleSettings} className="close-settings-button">Close</button>
        </div>
      )}

      {/* --- Beta Notice Modal --- */}
      {/* --- Beta Notice Modal --- */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
           <div className="beta-notice-modal">
             <h2>⚠️ Beta Version</h2>
             {/* You can customize this text */}
             <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
             <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
           </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="App-header">{/* ... Header content ... */}</header>

      {/* --- Chatbot Page --- */}
      {/* Pass the potentially insecure key down if ChatbotPage needs it */}
      {/* !! REMEMBER: Passing secrets like this is not secure for production !! */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
        // You might need to pass the key down if getBotResponse is inside ChatbotPage
        // accessKey={USER_PROVIDED_ACCESS_KEY}
       />
    </div>
  );
}

export default App;