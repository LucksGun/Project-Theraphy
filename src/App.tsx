// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react'; // Ensure React is imported
import './App.css'; // Ensure this CSS file is linked
import ChatbotPage from './ChatbotPage'; // Assuming ChatbotPage component exists

// --- Message interface definition ---
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
}

// Define allowed model types (All possible models)
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// localStorage Keys
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey'; // Key for storing the entered access key

// --- Model Configuration ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }

const ALL_AVAILABLE_MODELS: ModelInfo[] = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
  { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Experimental', restricted: true }, // Restricted
  { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Generation Experimental', restricted: true }, // Restricted
  { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Experimental', restricted: true } // Restricted
];

// Create a list of just the restricted model values for easier checking
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS
  .filter(m => m.restricted)
  .map(m => m.value);

// The actual secret key required (should match worker env.ACCESS_KEY)
const REQUIRED_ACCESS_KEY = "super_secret_password_321"; // Replace with your actual key value

// --- API Call Logic (Kept inside App.tsx as requested) ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Define interface for API request body if preferred
interface ApiRequestBody {
    prompt: string;
    model: GeminiModel;
    imageMimeType?: string; // Keep optional for potential reuse
    imageDataUrl?: string;  // Keep optional for potential reuse
    accessKey: string;
}

// Note: This version is simplified for text-only analysis form usage
async function getBotResponseForAnalysis(
    userInput: string,
    model: GeminiModel,
    accessKey: string
): Promise<string> {
    const promptToSend = userInput; // Use the direct input for analysis
    if (!promptToSend) { return "Error: No text provided for analysis."; }

    const requestBody: ApiRequestBody = {
        prompt: promptToSend,
        model: model,
        accessKey: accessKey
        // No image data included for this specific call
    };

    console.log(`Sending Analysis Request (Using Model: ${model}):`, {
         promptLength: promptToSend.length,
         model: requestBody.model,
         accessKey: requestBody.accessKey ? 'present' : 'none'
    });

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status} ${response.statusText}` }));
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }
        const data = await response.json(); // Assuming response format { reply?: string, error?: string }
        if (data.error) { throw new Error(data.error); }
        console.log('Received analysis reply from Worker:', data.reply);
        return data.reply || 'Sorry, I received an empty reply.';
    } catch (error) {
        console.error('Error fetching bot response for analysis:', error);
        if (error instanceof Error) { return `Error: ${error.message}`; }
        return 'Error: Could not fetch response.';
    }
}
// --- End API Call Logic ---


function App() {
  // --- State Variables ---

  // Messages State & Persistence
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    let initialMessages: Message[] = [];
    try {
      initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
      if (!Array.isArray(initialMessages)) { throw new Error("Parsed data not an array"); }
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      initialMessages = [];
    }
    if (initialMessages.length === 0) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      return [welcomeMessage];
    } else {
      return initialMessages;
    }
  });

  // Beta Notice State
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);

  // Entered Access Key State
  const [enteredKey, setEnteredKey] = useState<string>(() => {
      return localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
  });

  // Determine access based on the ENTERED key state
  const userHasAccessToRestricted = enteredKey === REQUIRED_ACCESS_KEY;

  // Model Selection State & Persistence
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash');

  // STT Language Selection State & Persistence
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
    if (savedLang && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(savedLang) ) {
        return savedLang;
    }
    return 'en-US';
  });

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- State for Analysis Form ---
  const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false); // For loading state

  // +++ State for the 5 Form Fields +++
  const [field1, setField1] = useState<string>('');
  const [field2, setField2] = useState<string>('');
  const [field3, setField3] = useState<string>('');
  const [field4, setField4] = useState<string>('');
  const [field5, setField5] = useState<string>('');


  // --- Effects ---

  // Effect to set initial or saved model based on key access
  useEffect(() => {
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
      let initialModel: GeminiModel = 'gemini-2.0-flash'; // Default

      const currentAccess = enteredKey === REQUIRED_ACCESS_KEY; // Check current key state

      if (savedModel && ALL_AVAILABLE_MODELS.some(m => m.value === savedModel)) {
          if (RESTRICTED_MODELS_VALUES.includes(savedModel)) {
              if (currentAccess) { // Use the calculated access boolean
                  initialModel = savedModel;
              } else {
                  console.warn(`Saved model ${savedModel} is restricted, access denied. Falling back.`);
                  // Fallback to default handled below
              }
          } else {
              initialModel = savedModel; // Not restricted, okay to load
          }
      }
      // Update state only if needed, handles fallback and initial load
      setSelectedModel(currentModel => {
          // If current model is restricted but user lost access, reset to default
          if (RESTRICTED_MODELS_VALUES.includes(currentModel) && !currentAccess) {
              return 'gemini-2.0-flash';
          }
          // Set to the determined initial model (saved or default)
          // Check if the initialModel itself is restricted and if user has access
          if(RESTRICTED_MODELS_VALUES.includes(initialModel) && !currentAccess) {
              return 'gemini-2.0-flash'; // Fallback if calculated initialModel is restricted without access
          }
          return initialModel;
      });

  // Depend on enteredKey to re-evaluate if access changes
  }, [enteredKey]);


  // Persistence Effects
  useEffect(() => {
    // Only save if there are messages beyond the initial welcome, or if explicitly cleared to empty
    if (messages.length > 1 || (messages.length === 1 && messages[0].sender !== 'bot')) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else if (messages.length === 0) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); // Save empty array if cleared
    }
    // Avoid saving if only the initial bot welcome message exists
  }, [messages]);

  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') { setShowBetaNotice(true); }
  }, []);

  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
  useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]); // Persist entered key


  // --- Event Handlers ---
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      if (ALL_AVAILABLE_MODELS.some(m => m.value === newModel)) {
          setSelectedModel(newModel);
      } else { console.error(`Attempted to select invalid model: ${newModel}`); }
  };

  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage);
  };

  const toggleSettings = () => { setIsSettingsOpen(prev => !prev); };

  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]);
      // Overwrite localStorage with just the welcome message
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([welcomeMessage]));
      setIsSettingsOpen(false);
    }
  };

  const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
      setEnteredKey(event.target.value);
  };


  // --- Handlers for Analysis Form ---
  const clearAnalysisForm = () => {
    setField1('');
    setField2('');
    setField3('');
    setField4('');
    setField5('');
  };

  const toggleAnalysisForm = () => {
      setIsAnalysisFormVisible(prev => !prev);
      if (isAnalysisFormVisible) { // If closing
          clearAnalysisForm(); // Clear all fields when closing
          setIsAnalyzing(false); // Ensure loading state is reset
      }
  };

  const handleAnalysisSubmit = async (event: React.FormEvent) => {
      event.preventDefault();

      // Trim all field values
      const val1 = field1.trim();
      const val2 = field2.trim();
      const val3 = field3.trim();
      const val4 = field4.trim();
      const val5 = field5.trim();

      // Check if required field (Field 1) is filled and not already analyzing
      if (!val1 || isAnalyzing) return;

      setIsAnalyzing(true);
      setIsAnalysisFormVisible(false); // Close form

      // Construct the prompt string, labelling each field's input
      // You can change the labels "Field X" here to match your actual field names
      let combinedInput = `Field 1: ${val1}\n`; // Label used in prompt
      if (val2) combinedInput += `Field 2: ${val2}\n`; // Label used in prompt
      if (val3) combinedInput += `Field 3: ${val3}\n`; // Label used in prompt
      if (val4) combinedInput += `Field 4: ${val4}\n`; // Label used in prompt
      if (val5) combinedInput += `Field 5: ${val5}\n`; // Label used in prompt

      // Add a "Thinking..." message to the chat
      const thinkingTime = Date.now();
      // Display only the first field in the thinking message for brevity
      const thinkingMessage: Message = { id: thinkingTime, text: `Analyzing Input (Field 1: "${val1.substring(0, 40)}...")...`, sender: 'loading', timestamp: thinkingTime };
      setMessages(prev => [...prev, thinkingMessage]);
      clearAnalysisForm(); // Clear form fields in state after grabbing values

      // Call the bot for analysis with the combined & labelled input
      const analysisResult = await getBotResponseForAnalysis(combinedInput.trim(), selectedModel, enteredKey); // Assumes 'selectedModel' and 'enteredKey' are available

      // Replace thinking message with the result
      const resultTime = Date.now() + 1; // Ensure unique ID
      const resultMessage: Message = { id: resultTime, text: analysisResult, sender: 'bot', timestamp: resultTime };

      setMessages(prev => [
          ...prev.filter(msg => msg.id !== thinkingTime), // Remove thinking message
          resultMessage // Add result message
      ]);

      setIsAnalyzing(false); // Reset loading state
  };


  // --- JSX Return Statement ---
  return (
    <div className="App">
      {/* --- Settings Menu (Conditional) --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>
           {/* Access Key Input */}
           <div className="settings-option">
            <label htmlFor="access-key-input">Access Key:</label>
            <input
              type="password"
              id="access-key-input"
              className="settings-input"
              placeholder="Enter key for restricted models"
              value={enteredKey}
              onChange={handleAccessKeyChange}
            />
            {enteredKey && ( <span style={{ fontSize: '0.8em', marginLeft: '5px' }}>{userHasAccessToRestricted ? '✅' : '❌'}</span> )}
           </div>
          {/* STT Language Selector */}
           <div className="settings-option">
            <label htmlFor="stt-lang-select">Speak Language:</label>
            <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                <option value="en-US">English (US)</option>
                <option value="th-TH">ไทย (Thai)</option>
                <option value="es-ES">Español (España)</option>
                <option value="fr-FR">Français (France)</option>
            </select>
           </div>
          {/* Model Selector */}
           <div className="settings-option">
             <label htmlFor="model-select">AI Model:</label>
             <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select">
                 {ALL_AVAILABLE_MODELS.map((modelInfo) => {
                     const isDisabled = modelInfo.restricted && !userHasAccessToRestricted;
                     const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                     return (
                         <option key={modelInfo.value} value={modelInfo.value} disabled={isDisabled} style={style}>
                             {modelInfo.label}{modelInfo.restricted ? ' (Restricted)' : ''}
                         </option>
                     );
                 })}
             </select>
             {!userHasAccessToRestricted && RESTRICTED_MODELS_VALUES.length > 0 && (
                <p style={{fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '5px'}}>
                   Models marked (Restricted) require the correct Access Key.
                </p>
             )}
           </div>
          {/* Clear Chat History Button */}
           <div className="settings-option">
             <button onClick={handleClearChat} className="clear-chat-settings-button">
                🗑️ Clear Chat History
             </button>
           </div>
          {/* Separator Line */}
           <hr className="settings-separator" />
          {/* Close Button */}
           <button onClick={toggleSettings} className="close-settings-button">Close</button>
        </div>
      )}

      {/* +++ Analysis Form Modal with 5 Fields +++ */}
      {isAnalysisFormVisible && (
          <div className="analysis-form-overlay">
              <div className="analysis-form-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title">
                  {/* ===> EDIT FORM TITLE HERE <=== */}
                  <h3 id="analysis-title">Submit Details for Analysis</h3>

                  <form onSubmit={handleAnalysisSubmit}>

                      {/* === Field 1 (Required) === */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                          {/* ===> EDIT Field 1 LABEL HERE <=== */}
                          <label htmlFor="analysis-field1">Field 1 (Required):</label>
                          <input
                              type="text"
                              id="analysis-field1"
                              className="settings-input"
                              value={field1}
                              onChange={(e) => setField1(e.target.value)}
                    
                              placeholder="Do you have any downside or concern? คุณมีปมด้อยหรือความกังวลอะไรไหม"
                              disabled={isAnalyzing}
                              required // HTML5 required attribute
                          />
                      </div>

                      {/* === Field 2 === */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                         
                          <label htmlFor="analysis-field2">Field 2:</label>
                          <input
                              type="text"
                              id="analysis-field2"
                              className="settings-input"
                              value={field2}
                              onChange={(e) => setField2(e.target.value)}
                  
                              placeholder="What thing you enjoy spending time with? คูณมีความสุขใช้เวลาไปกับสิ่งอะไรมากที่สุด"
                              disabled={isAnalyzing}
                          />
                      </div>

                      {/* === Field 3 === */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                          {/* ===> EDIT Field 3 LABEL HERE <=== */}
                          <label htmlFor="analysis-field3">Field 3:</label>
                          <input
                              type="text"
                              id="analysis-field3"
                              className="settings-input"
                              value={field3}
                              onChange={(e) => setField3(e.target.value)}
                          
                              placeholder="How would you describe yourself? คุณอธิบายตัวคุณได้ดีที่สุดว่าเป็นอย่างไร"
                              disabled={isAnalyzing}
                          />
                      </div>

                      {/* === Field 4 === */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                           {/* ===> EDIT Field 4 LABEL HERE <=== */}
                          <label htmlFor="analysis-field4">Field 4:</label>
                          <input
                              type="text"
                              id="analysis-field4"
                              className="settings-input"
                              value={field4}
                              onChange={(e) => setField4(e.target.value)}
                             
                              placeholder="What do you hate most when you study? คุณเกลียดอะไรมากที่สุดตอนเรียน"
                              disabled={isAnalyzing}
                          />
                      </div>

                      {/* === Field 5 === */}
                      {/* You could change this to textarea if needed */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                          {/* ===> EDIT Field 5 LABEL HERE <=== */}
                          <label htmlFor="analysis-field5">Field 5:</label>
                          <input
                              type="text" // Change to <textarea rows={3} className="settings-input"> if needed
                              id="analysis-field5"
                              className="settings-input"
                              value={field5}
                              onChange={(e) => setField5(e.target.value)} // Adjust if using textarea
                              
                              placeholder="GPA? เกรดเฉลี่ย"
                              disabled={isAnalyzing}
                          />
                      </div>

                      {/* === Form Actions (Buttons) === */}
                      <div className="analysis-form-actions">
                           <button
                               type="button"
                               onClick={toggleAnalysisForm}
                               className="close-settings-button" // Reuse style
                               disabled={isAnalyzing}
                           >
                               Cancel
                           </button>
                          <button
                              type="submit"
                              className="beta-accept-button" // Reuse style from beta modal
                              // Disable if required field is empty or currently analyzing
                              disabled={!field1.trim() || isAnalyzing}
                          >
                              {isAnalyzing ? 'Submitting...' : 'Submit Analysis'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* --- Beta Notice Modal (Keep as is) --- */}
      {showBetaNotice && (
         <div className="beta-notice-overlay">
            <div className="beta-notice-modal">
              <h2>⚠️ Beta Version</h2>
              <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
              <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
            </div>
         </div>
      )}

      {/* --- Header --- */}
      <header className="App-header">
        {/* Container for left buttons */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
                onClick={toggleSettings}
                className="settings-button"
                title="Settings"
                aria-label="Open settings menu"
                aria-expanded={isSettingsOpen}
            >
                ⚙️
            </button>
            {/* Analysis Button */}
            <button
                onClick={toggleAnalysisForm}
                className="settings-button analysis-button"
                title="Submit Details for Analysis" // Updated title
                aria-label="Open analysis form"
                aria-expanded={isAnalysisFormVisible}
            >
                📝 {/* Example Icon: Memo/Note */}
            </button>
        </div>

        <h1>Project Theraphy - Chatbot</h1>
        <div className="header-spacer-right"></div> {/* Keeps title centered */}
      </header>

      {/* --- Chatbot Page (Pass props down) --- */}
      {/* IMPORTANT: Ensure ChatbotPage uses the API logic appropriately */}
      {/* If ChatbotPage also needs getBotResponse, consider moving it */}
      {/* out to api.ts and importing in both files. */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
        accessKey={enteredKey} // Pass the entered key
       />
    </div>
  ); // End of return statement

} // End of App function

export default App;