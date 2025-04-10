// src/InterviewMode.tsx - Complete Code (No Placeholder Comments)

import { useState, useEffect, useRef, useCallback } from 'react';
// Assuming types and constants can be imported from App or another shared location
import { Message, GeminiModel, SpeechLanguage, ApiRequestBody, WORKER_URL } from './App';
import './InterviewMode.css'; // Make sure this CSS file exists

// --- STT/TTS Setup & Browser API Declarations ---
declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;
declare var SpeechSynthesisUtterance: {
    prototype: SpeechSynthesisUtterance;
    new(text?: string): SpeechSynthesisUtterance;
};
declare var SpeechRecognitionEvent: {
    prototype: SpeechRecognitionEvent;
    new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent;
};
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
    sttLang: SpeechLanguage; // Expect 'th-TH' for Thai STT
}

// --- Types for Interview ---
type InterviewStage = 'idle' | 'requesting_perms' | 'starting' | 'listening' | 'processing_user' | 'ai_thinking' | 'ai_speaking' | 'finished' | 'error' | 'user_turn';
type InterviewResult = 'pass' | 'fail' | null;
type HistoryItem = { role: 'user' | 'model'; parts: { text: string }[] };

const INTERVIEWER_PERSONA_ID = 'interviewer'; // Matches the key expected in KV/backend

// --- Reusable fetch logic ---
async function getBotResponseInterview(
    userInput: string,
    history: HistoryItem[],
    model: GeminiModel,
    persona: string,
    accessKey: string
): Promise<{ text: string; imageUrl: string | null }> {
    const requestBody: ApiRequestBody = {
        action: 'chat',
        prompt: userInput,
        model: model,
        persona: persona as any,
        accessKey: accessKey || undefined,
        history: history,
    };
    console.log(`Interview API Req (Model: ${model}, Persona: ${persona}, History: ${history.length})`);
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            let errorBody = { error: `API Error: ${response.status}` };
            try { errorBody = await response.json(); } catch (e) { console.warn("Could not parse error response body"); }
            throw new Error(errorBody?.error || `API Error: ${response.status}`);
        }
        const responseData = await response.json();
        if (responseData.error) throw new Error(responseData.error);
        return {
            text: responseData.reply || '',
            imageUrl: responseData.imageUrl || null,
        };
    } catch (error) {
        console.error('getBotResponseInterview Error:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`) : 'Error: Unknown fetch error.';
        return { text: errorMessage, imageUrl: null };
    }
}


// --- InterviewMode Component ---
function InterviewMode({ isOpen, onClose, selectedModel, accessKey, sttLang }: InterviewModeProps) {
    const [stage, setStage] = useState<InterviewStage>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [result, setResult] = useState<InterviewResult>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSttActive, setIsSttActive] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<any>(null);
    const messageHistoryRef = useRef<HistoryItem[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<InterviewStage>(stage);

    useEffect(() => { stageRef.current = stage; }, [stage]);

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
            if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') { errMsg += " Please grant permissions in browser settings."; }
            else if ((err as Error).name === 'NotFoundError' || (err as Error).name === 'DevicesNotFoundError') { errMsg += " No camera/microphone found."; }
            setError(errMsg);
            setStage('error');
            setCameraStream(null);
        }
    }, []);

    const stopStreams = useCallback(() => {
        if (cameraStream) {
            console.log("InterviewMode: Stopping media streams.");
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        if (recognitionRef.current && isSttActive) {
             try { recognitionRef.current.stop(); } catch(e){ console.warn("Error stopping STT:", e)}
             setIsSttActive(false);
        }
         if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
             window.speechSynthesis.cancel();
         }
         setIsSttActive(false); // Ensure reset
    }, [cameraStream, isSttActive]);

    // --- Callback Definitions (ORDER MATTERS!) ---

    // 1. startListening
    const startListening = useCallback(() => {
        if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
            console.log("startListening: Cancelling active TTS.");
            window.speechSynthesis.cancel();
        }
        if (!recognitionRef.current || isSttActive || stageRef.current !== 'user_turn') {
            console.warn("Cannot start STT in current state:", { hasRef: !!recognitionRef.current, isSttActive, stage: stageRef.current });
             if (stageRef.current === 'ai_speaking') {
                 console.log("Attempted to listen while AI speaking, forcing stage to user_turn.");
                 setStage('user_turn');
             }
            return;
        }
        console.log(`InterviewMode: Starting STT listening in lang: ${sttLang}...`);
        setError(null);
        setStage('listening');
        try {
            recognitionRef.current.lang = sttLang;
            recognitionRef.current.start();
            setIsSttActive(true);
        } catch (e) {
            console.error("Error starting STT:", e);
            setError(`Could not start microphone: ${(e as Error).message}`);
            setIsSttActive(false);
            setStage('error');
        }
    }, [isSttActive, sttLang]); // Dependencies

    // 2. playAiResponse (depends on startListening) - Includes Thai TTS setting
    const playAiResponse = useCallback((text: string) => {
         if (!isSpeechSynthesisSupported || !text) {
             console.warn("TTS not supported or text empty. Moving to user turn.");
             setStage('user_turn');
             setTimeout(startListening, 500);
             return;
         }
         console.log("InterviewMode: Preparing to play AI response...");
         setStage('ai_speaking');

         const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '');
         const utterance = new SpeechSynthesisUtterance(cleanText);
         utterance.lang = 'th-TH'; // Request Thai voice

         utterance.onend = () => {
            if (stageRef.current === 'ai_speaking') {
                 console.log("InterviewMode: TTS finished normally.");
                 setStage('user_turn');
                 setTimeout(startListening, 300);
            } else { console.log("InterviewMode: TTS 'onend' fired but stage was no longer 'ai_speaking'. Ignoring."); }
         };

         utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
            if (stageRef.current === 'ai_speaking') {
                console.error('Interview TTS Error:', event.error);
                setError(`Speech synthesis error: ${event.error || 'Unknown'}`);
                setStage('error');
            } else { console.warn("InterviewMode: TTS 'onerror' fired but stage was no longer 'ai_speaking'. Ignoring."); }
         };

         if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            console.log("InterviewMode: Cancelling potentially active TTS before speaking new.");
            window.speechSynthesis.cancel();
         }

         console.log("InterviewMode: Calling window.speechSynthesis.speak() with lang 'th-TH'.");
         window.speechSynthesis.speak(utterance);

     }, [startListening]); // Dependency

    // 3. handleUserSpeech (depends on playAiResponse, stopStreams)
     const handleUserSpeech = useCallback(async (userText: string) => {
         console.log("InterviewMode: Processing user speech:", userText);
         const userMessage: Message = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };
         setMessages(prev => [...prev, userMessage]);
         messageHistoryRef.current.push({ role: 'user', parts: [{ text: userText }] });

         setStage('ai_thinking');
         const loadingMessage: Message = { id: Date.now() + 1, text: "...", sender: 'loading', timestamp: Date.now() + 1 };
         setMessages(prev => [...prev, loadingMessage]);

         const historyForApi = messageHistoryRef.current.slice(-10);

         try {
             const response = await getBotResponseInterview(userText, historyForApi, selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
             const botMessage: Message = { id: Date.now() + 2, text: response.text, sender: 'bot', timestamp: Date.now() + 2 };

              if(!response.text.startsWith("Error:")) { messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] }); }
              else { console.error("API returned error:", response.text); setError(response.text); }

             let endResult: InterviewResult = null;
             const lowerText = response.text.toLowerCase();
             if (lowerText.includes("conclusion: pass") || lowerText.includes("final result: pass") || lowerText.includes("outcome: pass")) { endResult = 'pass'; }
             else if (lowerText.includes("conclusion: fail") || lowerText.includes("final result: fail") || lowerText.includes("outcome: fail")) { endResult = 'fail'; }

             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);

             if (endResult) {
                 console.log("InterviewMode: Interview finished. Result:", endResult);
                 setResult(endResult);
                 setStage('finished');
                 stopStreams();
             } else if (response.text.startsWith("Error:")) {
                  setStage('error');
                  stopStreams();
             } else {
                 playAiResponse(response.text);
             }
         } catch (e) {
             const errorMsg = `Error processing response: ${(e as Error).message}`;
             console.error(errorMsg);
             setError(errorMsg);
             const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
             setStage('error');
             stopStreams();
         }
     }, [selectedModel, accessKey, playAiResponse, stopStreams]);

    // 4. startInterview (depends on playAiResponse, stopStreams)
    const startInterview = useCallback(async () => {
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Connecting to interviewer...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]);
        messageHistoryRef.current = [];
        try {
             const initialPrompt = "Please begin the interview."; // Use non-empty prompt
             const response = await getBotResponseInterview(initialPrompt, [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
             if (response.text.startsWith("Error:")) { throw new Error(response.text.substring(7)); }
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
             stopStreams();
        }
    }, [selectedModel, accessKey, playAiResponse, stopStreams]);


    // --- Effects (Defined AFTER callbacks) ---

    // Setup/Cleanup Effect
    useEffect(() => {
        if (isOpen) {
            console.log("InterviewMode: Effect running for isOpen=true.");
            setStage('idle'); startInterviewSetup();
        } else {
             console.log("InterviewMode: Effect running for isOpen=false. Current stage:", stageRef.current);
             if(stageRef.current !== 'idle') { stopStreams(); setStage('idle'); }
        }
        return () => {
             if (isOpen) { console.log("InterviewMode: Cleanup function running."); stopStreams(); }
         };
    }, [isOpen]); // CORRECTED: Only depends on isOpen


     // Attach Stream Effect
     useEffect(() => {
         if (cameraStream && videoRef.current) {
             console.log("InterviewMode: Attaching stream to video element.");
             videoRef.current.srcObject = cameraStream;
             videoRef.current.play().catch(playError => { console.error("InterviewMode: Video element play error:", playError); });
         } else if (videoRef.current) { videoRef.current.srcObject = null; }
          return () => { if (videoRef.current) { videoRef.current.srcObject = null; } };
     }, [cameraStream]);

    // STT Setup Effect
    useEffect(() => {
        if (!recognitionAvailable || !isOpen) return;
        if (!recognitionRef.current) {
            try {
                 recognitionRef.current = new SpeechRecognitionImpl();
                 recognitionRef.current.continuous = true;
                 recognitionRef.current.interimResults = false;
                 // Define handlers directly inside
                  recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                     let finalTranscript = '';
                     for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript; } }
                     const trimmedTranscript = finalTranscript.trim();
                     console.log("STT Final Transcript:", trimmedTranscript);
                     if (trimmedTranscript && stageRef.current === 'listening') { // Check stageRef
                          setIsSttActive(false);
                          try { recognitionRef.current.stop(); } catch(e){}
                          setStage('processing_user');
                          handleUserSpeech(trimmedTranscript);
                     } else if (trimmedTranscript && stageRef.current !== 'listening'){ console.log("STT received transcript but not in listening stage, ignoring:", trimmedTranscript); }
                     else { console.log("STT received empty final transcript."); }
                 };
                 recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                     console.error('Interview STT Error:', event.error, event.message);
                     setError(`Speech recognition error: ${event.error}`);
                     setIsSttActive(false);
                     if (stageRef.current === 'listening') setStage('user_turn'); // Check stageRef
                 };
                 recognitionRef.current.onend = () => {
                     console.log("STT naturally ended.");
                     // Check isSttActive before setting false to avoid unnecessary state updates
                     if (isSttActive) { setIsSttActive(false); }
                     if (stageRef.current === 'listening') {
                        console.log("STT ended unexpectedly during listening stage.");
                        setStage('user_turn'); // Check stageRef
                     }
                 };
                console.log("InterviewMode: STT initialized.");
            } catch (err) { console.error("Failed to initialize STT:", err); setError("Failed to initialize Speech Recognition."); setStage('error'); }
        }
        recognitionRef.current.onstart = () => console.log("STT Event: onstart (Listening has started)");
recognitionRef.current.onaudiostart = () => console.log("STT Event: onaudiostart (Audio capture started)");
recognitionRef.current.onsoundstart = () => console.log("STT Event: onsoundstart (Sound detected)");
recognitionRef.current.onspeechstart = () => console.log("STT Event: onspeechstart (Speech detected)");
recognitionRef.current.onspeechend = () => console.log("STT Event: onspeechend (Finished detecting speech)");
recognitionRef.current.onaudioend = () => console.log("STT Event: onaudioend (Audio capture ended)");
recognitionRef.current.onnomatch = () => console.log("STT Event: onnomatch (No recognition match)");
        if (recognitionRef.current) { try { recognitionRef.current.lang = sttLang; } catch (e) { console.error("Failed to set STT language:", e); } }
         return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e){} recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onend = null; } setIsSttActive(false); }
    }, [isOpen, sttLang, handleUserSpeech]); // Removed stage dependency


    // Effect to auto-start interview flow
    useEffect(() => {
        if (isOpen && stage === 'starting') {
            startInterview();
        }
    }, [isOpen, stage, startInterview]);


    // Render nothing if parent intends to hide and component is idle
    if (!isOpen && stage === 'idle') return null;

    // --- Render ---
    return (
        <div className="interview-mode-overlay">
            <div className="interview-mode-modal">
                {/* Using English title for simplicity now */}
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
                                         // Render paragraphs, handling potential multiple lines
                                         msg.text.split('\n').map((line, index) => (
                                             <p key={index} style={{margin: '0 0 0.2em 0'}}>{line || '\u00A0'}</p> // Use nbsp for empty lines
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
                            {/* Show recording dot only when STT is active AND stage is listening */}
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
                    onClick={onClose}
                    className="interview-close-button"
                    // Allow closing unless AI is thinking/speaking
                    disabled={stage === 'ai_thinking' || stage === 'ai_speaking'}
                    title={stage === 'ai_thinking' || stage === 'ai_speaking' ? "Wait for AI turn to finish" : (stage === 'finished' ? 'Close' : 'Leave Interview')}
                 >
                    {/* Button text based on state */}
                    {stage === 'finished' || stage === 'error' || stage === 'idle' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
        </div>
    );
}

export default InterviewMode;