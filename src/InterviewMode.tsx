// src/InterviewMode.tsx - NEW FILE (Basic Skeleton)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage } from './App'; // Import necessary types
import './InterviewMode.css'; // Create this CSS file for styling

// Assume getBotResponse is available or import/redefine needed parts
// Re-using getBotResponse might work if we just pass the 'interviewer' persona
// You might need a slightly modified version if the response structure needs changes
declare function getBotResponse(userInput: string, imageData: null, history: any[], model: GeminiModel, persona: string, accessKey: string): Promise<{ text: string; imageUrl: string | null }>;

// --- STT/TTS Setup (Similar to ChatbotPage, might need adjustments) ---
declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;
declare var SpeechSynthesisUtterance: any;
const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: GeminiModel;
    accessKey: string;
    sttLang: SpeechLanguage;
}

type InterviewStage = 'idle' | 'requesting_perms' | 'starting' | 'listening' | 'processing_user' | 'ai_thinking' | 'ai_speaking' | 'finished';
type InterviewResult = 'pass' | 'fail' | null;

const INTERVIEWER_PERSONA_ID = 'interviewer'; // Use the key defined in KV

function InterviewMode({ isOpen, onClose, selectedModel, accessKey, sttLang }: InterviewModeProps) {
    const [stage, setStage] = useState<InterviewStage>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [result, setResult] = useState<InterviewResult>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSttActive, setIsSttActive] = useState(false); // Track if STT is actively listening

    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<any>(null); // Adjust type based on SpeechRecognition
    const messageHistoryRef = useRef<Message[]>([]); // Keep history separate for API calls

    // --- Permission and Stream Handling ---
    const startInterviewSetup = useCallback(async () => {
        console.log("InterviewMode: Requesting permissions...");
        setError(null);
        setStage('requesting_perms');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera/Microphone access (getUserMedia) is not supported.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); // Need audio for mic
            console.log("InterviewMode: Permissions granted, stream obtained.");
            setCameraStream(stream);
            setStage('starting'); // Move to next stage
        } catch (err) {
            console.error("InterviewMode: Permission Error:", err);
            setError(`Error accessing camera/microphone: ${(err as Error).message}. Please grant permissions.`);
            setStage('idle'); // Go back to idle on error
            // Consider closing automatically after error: onClose();
        }
    }, []);

    const stopStreams = useCallback(() => {
        if (cameraStream) {
            console.log("InterviewMode: Stopping media streams.");
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        if (recognitionRef.current && isSttActive) {
             try { recognitionRef.current.abort(); } catch(e){} // Stop STT if active
             setIsSttActive(false);
        }
         if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
             window.speechSynthesis.cancel(); // Stop TTS if active
         }
    }, [cameraStream, isSttActive]);

    // Effect to request permissions when opened
    useEffect(() => {
        if (isOpen && stage === 'idle') {
            messageHistoryRef.current = []; // Reset history
            setMessages([]);
            setResult(null);
            startInterviewSetup();
        } else if (!isOpen) {
            stopStreams(); // Cleanup streams on close
            setStage('idle'); // Reset stage when closed
        }
        // Cleanup function for component unmount
        return () => {
             if (stage !== 'idle') stopStreams();
         };
    }, [isOpen, stage, startInterviewSetup, stopStreams]);

     // Effect to attach stream to video element
     useEffect(() => {
         if (cameraStream && videoRef.current) {
             videoRef.current.srcObject = cameraStream;
         }
     }, [cameraStream]);

    // --- STT Setup ---
    useEffect(() => {
        if (!recognitionAvailable || !isOpen) return;

        if (!recognitionRef.current) {
            recognitionRef.current = new SpeechRecognitionImpl();
            recognitionRef.current.continuous = true; // Listen more continuously
            recognitionRef.current.interimResults = false; // We want final results

            recognitionRef.current.onresult = (event: any) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                console.log("STT Final Transcript:", finalTranscript);
                if (finalTranscript.trim()) {
                     setIsSttActive(false); // Stop listening after final result
                     setStage('processing_user'); // Move to process the input
                     handleUserSpeech(finalTranscript.trim());
                } else {
                    // Maybe restart listening if empty? Or wait for stage change.
                    console.log("STT Empty final transcript");
                     setIsSttActive(false); // Stop listening on empty
                     // Decide what stage to go to - maybe back to listening?
                     if(stage === 'listening') {
                        // If we were listening and got nothing, maybe prompt again or wait?
                        // For now, just stop listening. The user might need to be prompted again by AI.
                     }
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Interview STT Error:', event.error, event.message);
                setError(`Speech recognition error: ${event.error} - ${event.message}`);
                setIsSttActive(false);
                // Don't automatically change stage, let AI handle re-prompting if needed
            };
             recognitionRef.current.onend = () => {
                 console.log("STT ended.");
                 setIsSttActive(false);
                  // If STT ends unexpectedly while in listening stage, restart it? Needs careful handling.
                 // if (stage === 'listening') {
                 //    startListening();
                 // }
             };
        }

        // Set language (needs to be done before starting)
         if (recognitionRef.current) {
             recognitionRef.current.lang = sttLang;
         }

    }, [isOpen, sttLang, stage]); // Re-run if lang changes or stage requires STT setup


    const startListening = useCallback(() => {
        if (!recognitionRef.current || isSttActive || !['listening', 'user_turn'].includes(stage)) {
            console.warn("Cannot start STT", {isSttActive, stage});
            return;
        }
         if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
             window.speechSynthesis.cancel(); // Ensure AI stops talking
         }
        console.log("InterviewMode: Starting STT...");
        setError(null);
        try {
            recognitionRef.current.start();
            setIsSttActive(true);
            setStage('listening'); // Explicitly set to listening
        } catch (e) {
            console.error("Error starting STT:", e);
            setError(`Could not start microphone: ${(e as Error).message}`);
            setIsSttActive(false);
            setStage('idle'); // Or some error state?
        }
    }, [isSttActive, stage]);

    // --- Interview Logic ---
    const startInterview = useCallback(async () => {
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Starting interview...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]);
        messageHistoryRef.current = []; // Clear history for API

        try {
             // Send empty prompt to get the interviewer's opening statement
             const response = await getBotResponse("", null, [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
             // Replace loading message
             setMessages([{ id: Date.now(), text: response.text, sender: 'bot', timestamp: Date.now() }]);
             playAiResponse(response.text); // Speak the opening
        } catch (e) {
             const errorMsg = `Failed to start interview: ${(e as Error).message}`;
             setError(errorMsg);
             setMessages([{ id: Date.now(), text: errorMsg, sender: 'bot', timestamp: Date.now()}]);
             setStage('finished'); // End if start fails
        }

    }, [selectedModel, accessKey]); // Dependencies for starting

    // Effect to auto-start interview flow after permissions granted
    useEffect(() => {
        if (stage === 'starting') {
            startInterview();
        }
    }, [stage, startInterview]);


    const playAiResponse = useCallback((text: string) => {
         if (!isSpeechSynthesisSupported || !text) {
             console.warn("TTS not supported or text empty.");
             setStage('user_turn'); // Assume AI turn finished, move to user
             // Potentially call startListening() here if appropriate for the flow
             return;
         }
         console.log("InterviewMode: Playing AI response...");
         setStage('ai_speaking');

         // Basic text cleanup for TTS
         const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2');
         const utterance = new SpeechSynthesisUtterance(cleanText);

         utterance.onend = () => {
             console.log("InterviewMode: TTS finished.");
             setStage('user_turn'); // AI finished speaking, now user's turn
             // Automatically start listening for the user's response
             startListening();
         };
         utterance.onerror = (event: any) => {
             console.error('Interview TTS Error:', event.error);
             setError(`Speech synthesis error: ${event.error}`);
             setStage('user_turn'); // Allow user to respond even if TTS failed
             startListening(); // Try starting listening anyway
         };

         window.speechSynthesis.cancel(); // Cancel any previous speech
         window.speechSynthesis.speak(utterance);

     }, [startListening]); // Include startListening if called from here

     const handleUserSpeech = useCallback(async (userText: string) => {
         console.log("InterviewMode: Processing user speech:", userText);
         const userMessage: Message = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };
         setMessages(prev => [...prev, userMessage]);
         messageHistoryRef.current.push(userMessage); // Add to history for API

         setStage('ai_thinking');
         const loadingMessage: Message = { id: Date.now() + 1, text: "...", sender: 'loading', timestamp: Date.now() + 1 };
         setMessages(prev => [...prev, loadingMessage]);

         // Prepare history for API
         const historyForApi = messageHistoryRef.current
             .slice(-10) // Limit history size
             .map(m => ({
                 role: m.sender === 'user' ? 'user' : 'model',
                 parts: [{ text: m.text }]
             }));

         try {
             const response = await getBotResponse(userText, null, historyForApi, selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
             const botMessage: Message = { id: Date.now() + 2, text: response.text, sender: 'bot', timestamp: Date.now() + 2 };

             // Add bot message to history *before* removing loading, in case of pass/fail check
              messageHistoryRef.current.push(botMessage);

             // Check for Pass/Fail indication in the response text (basic example)
             let endResult: InterviewResult = null;
             if (response.text.toLowerCase().includes("conclusion: pass")) {
                 endResult = 'pass';
             } else if (response.text.toLowerCase().includes("conclusion: fail")) {
                 endResult = 'fail';
             }

             // Update messages: remove loading, add bot response
             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);


             if (endResult) {
                 console.log("InterviewMode: Interview finished. Result:", endResult);
                 setResult(endResult);
                 setStage('finished');
                 // Optionally play the final message
                 // playAiResponse(response.text); // Or maybe just display it?
             } else {
                 playAiResponse(response.text); // Continue interview: Speak AI response
             }

         } catch (e) {
             const errorMsg = `Error getting response: ${(e as Error).message}`;
             setError(errorMsg);
             const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
             setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
             setStage('finished'); // End interview on error
         }

     }, [selectedModel, accessKey, playAiResponse]); // Dependencies


    if (!isOpen) return null;

    // --- Render ---
    return (
        <div className="interview-mode-overlay">
            <div className="interview-mode-modal">
                <h3>University Entrance Interview Simulation</h3>

                {error && <p className="interview-error">Error: {error}</p>}

                <div className="interview-layout">
                    {/* Camera View */}
                    <div className="interview-camera-view">
                        {cameraStream ? (
                            <video ref={videoRef} autoPlay playsInline muted={true} />
                        ) : (
                            <div className="placeholder">{stage === 'requesting_perms' ? 'Requesting permissions...' : 'Camera Loading...'}</div>
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
                                         <p>{msg.text}</p>
                                     )}
                                </div>
                            ))}
                            {/* Optional: Add scroll-to-bottom ref */}
                        </div>
                         {/* Status Indicator */}
                         <div className="interview-status">
                            {stage === 'listening' && "Listening..."}
                            {stage === 'ai_thinking' && "Thinking..."}
                            {stage === 'ai_speaking' && "Interviewer Speaking..."}
                            {stage === 'finished' && `Interview Finished: ${result ? result.toUpperCase() : 'Concluded'}`}
                            {stage === 'user_turn' && "Your Turn (Speak now)"}
                            {isSttActive && <span className="recording-dot"></span>}
                         </div>
                    </div>
                </div>


                {/* Show result clearly when finished */}
                {stage === 'finished' && result && (
                    <div className={`interview-result ${result}`}>
                        Result: {result.toUpperCase()}
                    </div>
                )}

                <button onClick={onClose} className="interview-close-button" disabled={stage === 'ai_thinking' || stage === 'ai_speaking'}>
                    {stage === 'finished' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
            {/* Basic Styling (Create InterviewMode.css) */}
            <style jsx global>{`
                .interview-mode-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 10px; }
                .interview-mode-modal { background: var(--container-bg, #fff); color: var(--text-primary, #000); border-radius: 8px; padding: 20px; width: 100%; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; border: 1px solid var(--border-color, #ccc); }
                .interview-mode-modal h3 { text-align: center; margin-top: 0; margin-bottom: 15px; font-size: 1.2em; }
                .interview-error { color: var(--key-invalid-color, red); text-align: center; margin-bottom: 10px; font-weight: 500; }
                .interview-layout { display: flex; gap: 15px; flex-grow: 1; overflow: hidden; margin-bottom: 15px; }
                .interview-camera-view { flex: 1; display: flex; flex-direction: column; align-items: center; background: #eee; border-radius: 6px; overflow: hidden; min-width: 200px; }
                .interview-camera-view video { width: 100%; height: auto; max-height: 300px; object-fit: cover; background: #000; }
                .interview-camera-view .placeholder { flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888; font-style: italic; min-height: 150px; text-align: center; }
                .interview-notice { font-size: 0.8em; color: var(--text-secondary); margin: 5px; text-align: center; }
                .interview-chat-view { flex: 2; display: flex; flex-direction: column; border: 1px solid var(--border-color, #ccc); border-radius: 6px; overflow: hidden; }
                .interview-messages { flex-grow: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
                .interview-message { padding: 6px 10px; border-radius: 12px; max-width: 90%; word-wrap: break-word; line-height: 1.4; font-size: 0.95em;}
                .interview-message p { margin: 0; }
                .interview-bot { background: var(--bot-bubble-bg, #f0f0f0); align-self: flex-start; }
                .interview-user { background: var(--user-bubble-bg, #0d6efd); color: #fff; align-self: flex-end; }
                .interview-loading { align-self: center; margin: 10px 0; }
                .interview-status { padding: 8px 10px; background: var(--button-secondary-bg, #eee); text-align: center; font-style: italic; color: var(--text-secondary); font-size: 0.9em; border-top: 1px solid var(--border-color, #ccc); display: flex; align-items: center; justify-content: center; gap: 8px; }
                .recording-dot { width: 10px; height: 10px; background-color: red; border-radius: 50%; animation: blink 1s infinite; }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                .interview-result { text-align: center; font-size: 1.3em; font-weight: bold; margin: 10px 0; padding: 10px; border-radius: 6px; }
                .interview-result.pass { color: var(--key-valid-color, green); background-color: #d1e7dd; }
                .interview-result.fail { color: var(--key-invalid-color, red); background-color: #f8d7da; }
                :root[data-theme='dark'] .interview-result.pass { background-color: #1c3c30; }
                :root[data-theme='dark'] .interview-result.fail { background-color: #4d2d30; }
                .interview-close-button { padding: 10px 20px; border: 1px solid var(--border-color); border-radius: 5px; cursor: pointer; background: var(--button-secondary-bg); margin-top: 10px; align-self: center; }
                .interview-close-button:hover:not(:disabled) { background: var(--button-secondary-hover-bg); }
                .interview-close-button:disabled { opacity: 0.6; cursor: default; }

                /* Basic Loading Indicator */
                .loading-indicator span { height: 6px; width: 6px; margin: 0 1px; background-color: var(--text-secondary); border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite ease-in-out both; }
                .loading-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .loading-indicator span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes bounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1.0); opacity: 1; } }


                @media (max-width: 768px) {
                    .interview-mode-modal { max-width: 95vw; max-height: 95vh; padding: 15px; }
                    .interview-layout { flex-direction: column; }
                    .interview-camera-view video { max-height: 200px; }
                }
            `}</style>
        </div>
    );
}

export default InterviewMode;