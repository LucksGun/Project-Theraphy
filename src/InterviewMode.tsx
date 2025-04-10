// src/InterviewMode.tsx - Complete Code with Assumed Fix for TS Error

import { useState, useEffect, useRef, useCallback } from 'react';
// Assuming types and constants can be imported from App or another shared location
import { Message, GeminiModel, SpeechLanguage, ApiRequestBody, WORKER_URL } from './App';
import './InterviewMode.css'; // Make sure this CSS file exists

// --- STT/TTS Setup & Browser API Declarations ---
// Use declare to inform TypeScript about potential global variables if specific types aren't installed
declare var SpeechRecognition: any; // Or install @types/dom-speech-recognition
declare var webkitSpeechRecognition: any;
declare var SpeechSynthesisUtterance: {
    prototype: SpeechSynthesisUtterance;
    new(text?: string): SpeechSynthesisUtterance;
};
declare var SpeechRecognitionEvent: {
    prototype: SpeechRecognitionEvent;
    new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent;
};
// Ensure SpeechSynthesisErrorEvent is declared if using stricter types
declare var SpeechSynthesisErrorEvent: {
    prototype: SpeechSynthesisErrorEvent;
    new(type: string, eventInitDict: SpeechSynthesisErrorEventInit): SpeechSynthesisErrorEvent;
};


const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

if (!recognitionAvailable) console.warn("InterviewMode: Speech Recognition not supported by this browser.");
if (!isSpeechSynthesisSupported) console.warn("InterviewMode: Speech Synthesis not supported by this browser.");

// --- Component Props Interface ---
interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: GeminiModel;
    accessKey: string;
    sttLang: SpeechLanguage;
}

// --- Types for Interview ---
// Define types *before* the component uses them
type InterviewStage =
  | 'idle'
  | 'requesting_perms'
  | 'starting'
  | 'listening'         // When STT is active and waiting for user
  | 'processing_user'   // After user speaks, before calling API
  | 'ai_thinking'       // Waiting for API response
  | 'ai_speaking'       // When TTS is playing AI response
  | 'finished'          // Interview concluded (pass/fail)
  | 'error'             // An unrecoverable error occurred
  | 'user_turn'         // Added state: AI finished, waiting for user to speak (STT not necessarily active yet)
  ; // <<< Make sure 'user_turn' is definitely listed here
type InterviewResult = 'pass' | 'fail' | null;
type HistoryItem = { role: 'user' | 'model'; parts: { text: string }[] };

const INTERVIEWER_PERSONA_ID = 'interviewer'; // Matches the key expected in KV/backend

// --- Reusable fetch logic (Can be moved to a shared API utility file) ---
async function getBotResponseInterview(
    userInput: string,
    history: HistoryItem[],
    model: GeminiModel,
    persona: string,
    accessKey: string
): Promise<{ text: string; imageUrl: string | null }> { // Using simplified return type
    const requestBody: ApiRequestBody = {
        action: 'chat',
        prompt: userInput,
        model: model,
        persona: persona as any, // Cast necessary if 'interviewer' isn't in the base Persona type
        accessKey: accessKey || undefined,
        history: history,
    };
    console.log(`Interview API Req (Model: ${model}, Persona: ${persona}, History: ${history.length})`);
    try {
        const response = await fetch(WORKER_URL, { // WORKER_URL needs to be defined/imported
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        // Improved error handling for JSON parsing and non-ok responses
        if (!response.ok) {
            let errorBody = { error: `API Error: ${response.status}` };
            try {
                 errorBody = await response.json();
            } catch (e) {
                 console.warn("Could not parse error response body");
            }
            throw new Error(errorBody?.error || `API Error: ${response.status}`);
        }
        const responseData = await response.json(); // Assume parsing succeeds if response.ok
        if (responseData.error) throw new Error(responseData.error);
        return {
            text: responseData.reply || '',
            imageUrl: responseData.imageUrl || null,
        };
    } catch (error) {
        console.error('getBotResponseInterview Error:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`) : 'Error: Unknown fetch error.';
        // Return structure consistent with success but with error text
        return { text: errorMessage, imageUrl: null };
    }
}


// --- InterviewMode Component ---
function InterviewMode({ isOpen, onClose, selectedModel, accessKey, sttLang }: InterviewModeProps) {
    // Ensure state uses the correct type defined above
    const [stage, setStage] = useState<InterviewStage>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [result, setResult] = useState<InterviewResult>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSttActive, setIsSttActive] = useState(false);
    const [, setIsAiSpeaking] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<any>(null); // SpeechRecognition instance
    const messageHistoryRef = useRef<HistoryItem[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- Scrolling ---
    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            scrollToBottom();
        }
    }, [messages, scrollToBottom]);

    // --- Permission and Stream Handling ---
    const startInterviewSetup = useCallback(async () => {
        console.log("InterviewMode: Requesting permissions...");
        setError(null);
        setResult(null);
        setMessages([]);
        messageHistoryRef.current = [];
        setStage('requesting_perms');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera/Microphone access (getUserMedia) is not supported by this browser.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            console.log("InterviewMode: Permissions granted, stream obtained.");
            setCameraStream(stream);
            setStage('starting');
        } catch (err) {
            console.error("InterviewMode: Permission Error:", err);
            let errMsg = `Error accessing camera/microphone: ${(err as Error).message}.`;
            if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') {
                errMsg += " Please grant permissions in browser settings.";
            } else if ((err as Error).name === 'NotFoundError' || (err as Error).name === 'DevicesNotFoundError') {
                errMsg += " No camera/microphone found.";
            }
            setError(errMsg);
            setStage('error');
        }
    }, []); // No dependencies needed here

    const stopStreams = useCallback(() => {
        if (cameraStream) {
            console.log("InterviewMode: Stopping media streams.");
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        if (recognitionRef.current && isSttActive) {
             try { recognitionRef.current.abort(); } catch(e){ console.warn("Error aborting STT:", e)}
             setIsSttActive(false);
        }
         if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
             window.speechSynthesis.cancel();
             setIsAiSpeaking(false);
         }
    }, [cameraStream, isSttActive]);

    // Effect for Setup and Cleanup based on isOpen
    useEffect(() => {
        if (isOpen) {
            console.log("InterviewMode: Opened. Resetting and starting setup.");
            setStage('idle');
            startInterviewSetup();
        } else {
            // Ensure cleanup happens when isOpen becomes false
            stopStreams();
            setStage('idle');
        }
        // Cleanup on unmount
        return () => {
             if (isOpen) { // Only run stopStreams on unmount if it was open
                console.log("InterviewMode: Unmounting/Cleanup.");
                stopStreams();
             }
         };
    }, [isOpen, startInterviewSetup, stopStreams]); // Dependencies ensure correct setup/cleanup

     // Effect to attach stream to video element
     useEffect(() => {
         if (cameraStream && videoRef.current) {
             console.log("InterviewMode: Attaching stream to video element.");
             videoRef.current.srcObject = cameraStream;
             // Attempt to play, catching potential errors
             videoRef.current.play().catch(playError => {
                 console.error("InterviewMode: Video element play error:", playError);
                 // You might want to show a message to the user here
                 //setError("Could not automatically play video feed.");
             });
         } else if (videoRef.current) {
             // Clear the srcObject if stream becomes null
             videoRef.current.srcObject = null;
         }
     }, [cameraStream]);

    // --- STT Setup ---
    useEffect(() => {
        // Only setup if available and component is open
        if (!recognitionAvailable || !isOpen) return;

        // Initialize STT instance only once
        if (!recognitionRef.current) {
            try {
                 recognitionRef.current = new SpeechRecognitionImpl();
                 recognitionRef.current.continuous = true; // Keep listening
                 recognitionRef.current.interimResults = false; // Final results only

                 recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                     let finalTranscript = '';
                     for (let i = event.resultIndex; i < event.results.length; ++i) {
                         if (event.results[i].isFinal) {
                             finalTranscript += event.results[i][0].transcript;
                         }
                     }
                     const trimmedTranscript = finalTranscript.trim();
                     console.log("STT Final Transcript:", trimmedTranscript);

                     if (trimmedTranscript && stage === 'listening') {
                          setIsSttActive(false); // Stop listening indicator
                          try { recognitionRef.current.stop(); } catch(e){ console.warn("Error stopping STT on result:", e) } // Stop listening explicitly
                          setStage('processing_user');
                          handleUserSpeech(trimmedTranscript);
                     } else if (trimmedTranscript && stage !== 'listening'){
                         console.log("STT received transcript but not in listening stage, ignoring:", trimmedTranscript);
                     } else {
                         console.log("STT received empty final transcript.");
                     }
                 };

                 recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                     console.error('Interview STT Error:', event.error, event.message);
                     setError(`Speech recognition error: ${event.error}`);
                     setIsSttActive(false);
                     // Consider stage transition? Maybe back to 'user_turn'?
                     if (stage === 'listening') setStage('user_turn');
                 };

                 recognitionRef.current.onend = () => {
                     console.log("STT naturally ended.");
                     // Only set active to false if it wasn't already stopped by onresult
                     if (isSttActive) {
                         setIsSttActive(false);
                     }
                     // If it ends while we *should* be listening, maybe go back to user_turn?
                     // Inside utterance.onerror:

                     if (stage === 'listening') {
                        console.log("STT ended unexpectedly during listening stage.");
                        setStage('user_turn');
                     }
                 };
                console.log("InterviewMode: STT initialized.");
            } catch (err) {
                console.error("Failed to initialize STT:", err);
                setError("Failed to initialize Speech Recognition.");
                setStage('error');
            }
        }

        // Set language (safe to do even if already set)
         if (recognitionRef.current) {
             try {
                recognitionRef.current.lang = sttLang;
             } catch (e) {
                console.error("Failed to set STT language:", e);
             }
         }

         // Cleanup STT instance on component unmount or when isOpen becomes false
         return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
                // Nullify handlers to prevent memory leaks
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                // Optional: recognitionRef.current = null; // If you want to force re-creation
            }
            setIsSttActive(false); // Ensure state is reset
         }

    }, [isOpen, sttLang, stage]); // stage added to deps to potentially react to STT errors needing stage change

    // Function to start STT listening
    const startListening = useCallback(() => {
        // Prevent starting if not ready, already active, or not user's turn
        if (!recognitionRef.current || isSttActive || stage !== 'user_turn') {
            console.warn("Cannot start STT in current state:", { hasRef: !!recognitionRef.current, isSttActive, stage });
            // If AI is speaking, cancel it
            if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                setIsAiSpeaking(false); // Correct state if TTS is interrupted by trying to listen
            }
            // If stage allows, transition back to user_turn
             if (stage === 'ai_speaking') {
                 setStage('user_turn');
             }
            return;
        }

        console.log("InterviewMode: Starting STT listening...");
        setError(null);
        setStage('listening'); // Update stage to 'listening'
        try {
            // Set language just before starting, in case it changed
            recognitionRef.current.lang = sttLang;
            recognitionRef.current.start();
            setIsSttActive(true);
        } catch (e) {
            console.error("Error starting STT:", e);
            setError(`Could not start microphone: ${(e as Error).message}`);
            setIsSttActive(false);
            setStage('error'); // Transition to error state if STT fails to start
        }
    }, [isSttActive, stage, sttLang]); // Include sttLang dependency

    // --- Interview Flow Logic ---

    // Function to start the interview
    const startInterview = useCallback(async () => {
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Connecting to interviewer...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]);
        messageHistoryRef.current = [];

        try {
             // Send empty prompt to get the interviewer's opening statement
             const response = await getBotResponseInterview("", [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);

             if (response.text.startsWith("Error:")) {
                 throw new Error(response.text.substring(7)); // Remove "Error: " prefix
             }

             const firstBotMessage: Message = { id: Date.now(), text: response.text, sender: 'bot', timestamp: Date.now() };
             messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
             setMessages([firstBotMessage]);
             playAiResponse(response.text);
        } catch (e) {
             const errorMsg = `Failed to start interview: ${(e as Error).message}`;
             console.error(errorMsg);
             setError(errorMsg);
             setMessages([{ id: Date.now(), text: errorMsg, sender: 'bot', timestamp: Date.now()}]);
             setStage('error');
        }
    }, [selectedModel, accessKey]); // Removed playAiResponse from deps as it's defined below

    // Effect to auto-start interview flow
    useEffect(() => {
        if (isOpen && stage === 'starting') { // Only start when open and in starting stage
            startInterview();
        }
    }, [isOpen, stage, startInterview]);


    // Function to play AI response using TTS
    const playAiResponse = useCallback((text: string) => {
         if (!isSpeechSynthesisSupported || !text) {
             console.warn("TTS not supported or text empty. Moving to user turn.");
             setStage('user_turn');
             setTimeout(startListening, 500);
             return;
         }
         console.log("InterviewMode: Playing AI response...");
         setStage('ai_speaking');
         setIsAiSpeaking(true);

         const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '');
         const utterance = new SpeechSynthesisUtterance(cleanText);

         utterance.onend = () => {
             console.log("InterviewMode: TTS finished.");
             setIsAiSpeaking(false);
             setStage('user_turn');
             setTimeout(startListening, 300);
         };
         utterance.onerror = (event: SpeechSynthesisErrorEvent) => { // Use correct event type
             console.error('Interview TTS Error:', event.error);
             setError(`Speech synthesis error: ${event.error}`);
             setIsAiSpeaking(false);
             // This line caused the TypeScript error, it should be valid if types are correct
             setStage('user_turn'); // Allow user turn even if TTS failed
             setTimeout(startListening, 300);
         };

         // Ensure any ongoing speech is stopped before starting new
         if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            console.log("InterviewMode: Cancelling previous TTS.");
            window.speechSynthesis.cancel();
         }
         // Small delay before speaking, sometimes helps avoid issues after cancel
         setTimeout(() => {
             window.speechSynthesis.speak(utterance);
         }, 50);

     }, [startListening]); // startListening is a dependency

     // Function to handle user speech and get AI response
     const handleUserSpeech = useCallback(async (userText: string) => {
         console.log("InterviewMode: Processing user speech:", userText);
         const userMessage: Message = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };
         setMessages(prev => [...prev, userMessage]);
         messageHistoryRef.current.push({ role: 'user', parts: [{ text: userText }] });

         setStage('ai_thinking');
         const loadingMessage: Message = { id: Date.now() + 1, text: "...", sender: 'loading', timestamp: Date.now() + 1 };
         setMessages(prev => [...prev, loadingMessage]);

         const historyForApi = messageHistoryRef.current.slice(-10); // Limit history

         try {
             const response = await getBotResponseInterview(userText, historyForApi, selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
             const botMessage: Message = { id: Date.now() + 2, text: response.text, sender: 'bot', timestamp: Date.now() + 2 };

              if(!response.text.startsWith("Error:")) {
                messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
              } else {
                 console.error("API returned error:", response.text);
                 setError(response.text); // Show API error to user
              }

             // Check for Pass/Fail indication (case-insensitive)
             let endResult: InterviewResult = null;
             const lowerText = response.text.toLowerCase();
             // Make checks more specific if possible based on prompt engineering
             if (lowerText.includes("conclusion: pass") || lowerText.includes("final result: pass") || lowerText.includes("outcome: pass")) {
                 endResult = 'pass';
             } else if (lowerText.includes("conclusion: fail") || lowerText.includes("final result: fail") || lowerText.includes("outcome: fail")) {
                 endResult = 'fail';
             }

             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);

             if (endResult) {
                 console.log("InterviewMode: Interview finished. Result:", endResult);
                 setResult(endResult);
                 setStage('finished');
                 stopStreams();
             } else if (response.text.startsWith("Error:")) {
                  setStage('error'); // Go to error state on API error
                  stopStreams();
             } else {
                 playAiResponse(response.text); // Continue interview
             }

         } catch (e) { // Catch errors from getBotResponseInterview itself
             const errorMsg = `Error processing response: ${(e as Error).message}`;
             console.error(errorMsg);
             setError(errorMsg);
             const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
             setStage('error');
             stopStreams();
         }

     }, [selectedModel, accessKey, playAiResponse, stopStreams]); // Dependencies


    // Render nothing if parent intends to hide and component is idle
    if (!isOpen && stage === 'idle') return null;

    // --- Render ---
    return (
        <div className="interview-mode-overlay">
            <div className="interview-mode-modal">
                <h3>University Entrance Interview Simulation</h3>

                {error && <p className="interview-error">{error}</p>}

                <div className="interview-layout">
                    {/* Camera View */}
                    <div className="interview-camera-view">
                        {stage !== 'idle' && stage !== 'requesting_perms' && cameraStream ? (
                            <video ref={videoRef} autoPlay playsInline muted={true} />
                        ) : (
                            <div className="placeholder">
                                {stage === 'requesting_perms' ? 'Requesting permissions...'
                                : stage === 'error' ? 'Camera/Mic Unavailable'
                                : 'Camera Off'}
                            </div>
                        )}
                         <p className="interview-notice">Your camera is active for observation.</p>
                    </div>

                    {/* Chat/Transcript View */}
                    <div className="interview-chat-view">
                        <div className="interview-messages">
                            {messages.map(msg => (
                                <div key={msg.id} className={`interview-message interview-${msg.sender}`}>
                                    {msg.sender === 'loading' ? (
                                         <div className="loading-indicator"><span></span><span></span><span></span></div>
                                     ) : (
                                         msg.text.split('\n').map((line, index) => (
                                             <p key={index} style={{margin: '0 0 0.2em 0'}}>{line || '\u00A0'}</p>
                                         ))
                                     )}
                                </div>
                            ))}
                             <div ref={messagesEndRef} style={{ height: '1px' }} />
                        </div>
                         {/* Status Indicator */}
                         <div className="interview-status">
                            {stage === 'listening' && "Listening..."}
                            {stage === 'ai_thinking' && "Interviewer Thinking..."}
                            {stage === 'ai_speaking' && "Interviewer Speaking..."}
                            {stage === 'finished' && `Interview Finished: ${result ? result.toUpperCase() : 'Concluded'}`}
                            {stage === 'error' && "An error occurred. Please close and retry."}
                            {stage === 'user_turn' && "Your Turn (Speak now)"}
                            {stage === 'starting' && "Starting Interview..."}
                            {stage === 'requesting_perms' && "Requesting Permissions..."}
                            {stage === 'processing_user' && "Processing your response..."}
                            {stage === 'idle' && "Initializing..."}
                            {isSttActive && stage === 'listening' && <span className="recording-dot"></span>}
                         </div>
                    </div>
                </div>


                {/* Show result clearly when finished */}
                {stage === 'finished' && result && (
                    <div className={`interview-result ${result}`}>
                        Result: {result.toUpperCase()}
                    </div>
                )}

                <button
                    onClick={onClose} // onClose should handle cleanup via useEffect
                    className="interview-close-button"
                    disabled={stage === 'ai_thinking' || stage === 'ai_speaking'} // Prevent leaving mid-AI turn
                    title={stage === 'ai_thinking' || stage === 'ai_speaking' ? "Wait for AI turn to finish" : (stage === 'finished' ? 'Close' : 'Leave Interview')}
                 >
                    {/* Change button text based on final state */}
                    {stage === 'finished' || stage === 'error' || stage === 'idle' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
        </div>
    );
}

export default InterviewMode;