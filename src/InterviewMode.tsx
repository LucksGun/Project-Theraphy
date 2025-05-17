// src/InterviewMode.tsx - Complete Code (No Placeholder Comments)

import { useState, useEffect, useRef, useCallback } from 'react';
// Assuming types and constants can be imported from App or another shared location
import { Message, GeminiModel, SpeechLanguage, ApiRequestBody, WORKER_URL } from './App';
import './InterviewMode.css'; // Make sure this CSS file exists

// --- STT/TTS Setup & Browser API Declarations ---
declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;
// SpeechSynthesisUtterance is removed as we aim for Google TTS
// declare var SpeechSynthesisUtterance: { ... };
declare var SpeechRecognitionEvent: {
    prototype: SpeechRecognitionEvent;
    new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent;
};
// SpeechSynthesisErrorEvent is removed
// declare var SpeechSynthesisErrorEvent: { ... };
// Add SpeechRecognitionErrorEvent if not globally available for STT error typing
declare interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string; // Common errors: 'no-speech', 'audio-capture', 'not-allowed', 'network', etc.
    readonly message: string;
}


const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
// isSpeechSynthesisSupported is removed as we are moving to Google TTS
// const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

if (!recognitionAvailable) console.warn("InterviewMode: Speech Recognition not supported by this browser.");
// if (!isSpeechSynthesisSupported) console.warn("InterviewMode: Browser Speech Synthesis not supported."); // No longer primary

// --- Component Props Interface ---
interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: GeminiModel;
    accessKey: string;
    sttLang: SpeechLanguage; // Expect 'th-TH' for Thai STT
    // ttsLang: string; // Add if you want to configure TTS language dynamically, e.g., "th-TH"
}

// --- Types for Interview ---
type InterviewStage = 'idle' | 'requesting_perms' | 'starting' | 'listening' | 'processing_user' | 'ai_thinking' | 'ai_speaking' | 'finished' | 'error' | 'user_turn';
type InterviewResult = 'pass' | 'fail' | null;
type HistoryItem = { role: 'user' | 'model'; parts: { text: string }[] };

const INTERVIEWER_PERSONA_ID = 'interviewer';

// --- Reusable fetch logic for Gemini ---
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
    const [isGoogleTtsPlaying, setIsGoogleTtsPlaying] = useState(false);


    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<any>(null); // For SpeechRecognition instance
    const messageHistoryRef = useRef<HistoryItem[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<InterviewStage>(stage);
    const googleTtsAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => { stageRef.current = stage; }, [stage]);

    // Refs for callbacks to ensure stable references for STT/TTS event handlers or setTimeout
    const handleUserSpeechRef = useRef<(userText: string) => Promise<void>>(async () => {});
    const startListeningRef = useRef<() => void>(() => {});
    const playGoogleCloudTTSRef = useRef<(text: string, lang: string) => Promise<void>>(async () => {});


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
            setStage('starting'); // This will trigger the effect to call startInterview
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

    const stopStreamsAndTTS = useCallback(() => {
        if (cameraStream) {
            console.log("InterviewMode: Stopping media streams.");
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        if (recognitionRef.current && isSttActive) {
            try {
                console.log("InterviewMode: Stopping STT via stopStreamsAndTTS.");
                recognitionRef.current.stop();
            } catch (e) { console.warn("Error stopping STT:", e); }
            setIsSttActive(false);
        }

        // Stop Google Cloud TTS audio if playing
        if (googleTtsAudioRef.current) {
            console.log("InterviewMode: Stopping Google TTS audio.");
            googleTtsAudioRef.current.pause();
            googleTtsAudioRef.current.currentTime = 0;
            googleTtsAudioRef.current.src = ""; // Release resource
            googleTtsAudioRef.current.onended = null;
            googleTtsAudioRef.current.onerror = null;
        }
        setIsGoogleTtsPlaying(false);

        setIsSttActive(false); // Ensure STT state is reset
    }, [cameraStream, isSttActive]); // Removed isGoogleTtsPlaying as ref handles it

    // --- Callback Definitions (ORDER MATTERS for initial definition, refs help with staleness) ---

    // 1. startListening (STT)
    const startListening = useCallback(() => {
        if (isGoogleTtsPlaying && googleTtsAudioRef.current) {
            console.log("startListening: Stopping active Google TTS audio before listening.");
            googleTtsAudioRef.current.pause();
            googleTtsAudioRef.current.currentTime = 0;
            setIsGoogleTtsPlaying(false); // Explicitly set state
        }

        if (!recognitionRef.current) {
            console.warn("Cannot start STT: Recognition engine not initialized.");
            setError("Microphone input is not ready. Please ensure permissions are granted and try again.");
            setStage('error');
            return;
        }
        if (isSttActive) {
            console.warn("Cannot start STT: Already active.");
            return;
        }
        if (stageRef.current !== 'user_turn') {
            console.warn(`Cannot start STT: Not user's turn. Current stage: ${stageRef.current}. Forcing to user_turn if AI was speaking.`);
             if (stageRef.current === 'ai_speaking') { // If TTS ended abruptly or onend didn't fire
                setStage('user_turn'); // Force to user_turn
                // Schedule the actual listen attempt after state update
                setTimeout(() => startListeningRef.current(), 50);
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
            setError(`Could not start microphone: ${(e as Error).message}. Check browser permissions.`);
            setIsSttActive(false);
            setStage('error'); // Or 'user_turn' to allow retry from UI
        }
    }, [isSttActive, sttLang, isGoogleTtsPlaying]); // stageRef is used via ref

    useEffect(() => { startListeningRef.current = startListening; }, [startListening]);


    // 2. playGoogleCloudTTS (New TTS function)
    const playGoogleCloudTTS = useCallback(async (text: string, lang: string) => {
        if (!text) {
            console.warn("Google TTS: Text is empty. Moving to user turn.");
            setStage('user_turn');
            setTimeout(() => startListeningRef.current(), 300);
            return;
        }
        if (isSttActive && recognitionRef.current) {
            console.log("playGoogleCloudTTS: STT is active, stopping it first.");
            try { recognitionRef.current.stop(); } catch(e) {}
            setIsSttActive(false);
        }

        console.log("InterviewMode: Preparing to play AI response via Google Cloud TTS...");
        setStage('ai_speaking');
        setIsGoogleTtsPlaying(true);
        setError(null); // Clear previous errors

        try {
            const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '');

            const ttsRequestBody = {
                action: 'synthesize_speech', // This action needs to be handled by your WORKER_URL backend
                text: cleanText,
                languageCode: lang, // e.g., "th-TH"
                // voice: { name: 'th-TH-Wavenet-A' } // Optional: specify voice model in backend
                accessKey: accessKey, // Your backend might use this to auth/manage Google API key
            };

            const response = await fetch(WORKER_URL, { // Or a dedicated TTS worker URL
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ttsRequestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Google TTS API Error: ${response.status}` }));
                throw new Error(errorData.error || `Google TTS API Error: ${response.status}`);
            }

            const responseData = await response.json(); // Expecting { audioContent: "base64..." } or { audioUrl: "..." }

            if (responseData.error) throw new Error(responseData.error);
            if (!responseData.audioContent && !responseData.audioUrl) {
                throw new Error("No audio content/URL received from Google TTS service via worker.");
            }

            if (googleTtsAudioRef.current) { // Cleanup previous audio element if any
                googleTtsAudioRef.current.onended = null;
                googleTtsAudioRef.current.onerror = null;
                googleTtsAudioRef.current.src = ""; // Release old audio data
            }

            const audio = googleTtsAudioRef.current || new Audio(); // Reuse or create new
            googleTtsAudioRef.current = audio;

            if (responseData.audioUrl) {
                audio.src = responseData.audioUrl;
            } else if (responseData.audioContent) {
                audio.src = `data:audio/mp3;base64,${responseData.audioContent}`; // Assuming MP3 from backend
            }

            audio.onended = () => {
                setIsGoogleTtsPlaying(false);
                if (stageRef.current === 'ai_speaking') {
                    console.log("InterviewMode: Google TTS finished normally.");
                    setStage('user_turn');
                    setTimeout(() => startListeningRef.current(), 300);
                } else {
                    console.log("InterviewMode: Google TTS 'onended' fired but stage was " + stageRef.current + ". Ignoring.");
                }
            };

            audio.onerror = (e) => {
                setIsGoogleTtsPlaying(false);
                console.error('Interview Google TTS Error:', e);
                setError(`Speech synthesis error with Google TTS. The AI's response might not have been spoken.`);
                if (stageRef.current === 'ai_speaking') {
                    setStage('user_turn'); // Move to user's turn even if TTS fails, so they can proceed
                    setTimeout(() => startListeningRef.current(), 300);
                }
            };
            console.log("InterviewMode: Calling audio.play() for Google TTS.");
            await audio.play();

        } catch (error) {
            setIsGoogleTtsPlaying(false);
            console.error('Google Cloud TTS fetch/play error:', error);
            setError(`Google TTS Error: ${(error as Error).message}. Moving to your turn.`);
            if (stageRef.current === 'ai_speaking' || stageRef.current === 'ai_thinking') {
                 setStage('user_turn'); // Fallback to user turn
                 setTimeout(() => startListeningRef.current(), 300);
            }
        }
    // }, [accessKey, isSttActive]); // Dependencies. startListeningRef is stable.
    }, [accessKey, isSttActive]); // `lang` is passed as arg, `sttLang` is for STT.

    useEffect(() => { playGoogleCloudTTSRef.current = playGoogleCloudTTS; }, [playGoogleCloudTTS]);

    // 3. handleUserSpeech (Processes STT result)
    const handleUserSpeech = useCallback(async (userText: string) => {
        console.log("InterviewMode: Processing user speech:", userText);
        const userMessage: Message = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]);
        messageHistoryRef.current.push({ role: 'user', parts: [{ text: userText }] });

        setStage('ai_thinking');
        const loadingMessage: Message = { id: Date.now() + 1, text: "...", sender: 'loading', timestamp: Date.now() + 1 };
        setMessages(prev => [...prev, loadingMessage]);

        const historyForApi = messageHistoryRef.current.slice(-10); // Keep history manageable

        try {
            const response = await getBotResponseInterview(userText, historyForApi, selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
            const botMessage: Message = { id: Date.now() + 2, text: response.text, sender: 'bot', timestamp: Date.now() + 2 };

            if (!response.text.startsWith("Error:")) {
                messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            } else {
                console.error("API returned error:", response.text);
                setError(response.text); // Show API error to user
            }

            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);

            let endResult: InterviewResult = null;
            const lowerText = response.text.toLowerCase();
            if (lowerText.includes("conclusion: pass") || lowerText.includes("final result: pass") || lowerText.includes("outcome: pass")) { endResult = 'pass'; }
            else if (lowerText.includes("conclusion: fail") || lowerText.includes("final result: fail") || lowerText.includes("outcome: fail")) { endResult = 'fail'; }

            if (endResult) {
                console.log("InterviewMode: Interview finished. Result:", endResult);
                setResult(endResult);
                setStage('finished');
                // stopStreamsAndTTS(); // stopStreams called by onClose or useEffect for isOpen=false
                playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US'); // Speak final result
            } else if (response.text.startsWith("Error:")) {
                setStage('error'); // API error already set
                // stopStreamsAndTTS(); // Let user close or retry based on error message.
            } else {
                // AI responds, then it will be user's turn
                playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US'); // Assuming TTS lang matches STT base lang
            }
        } catch (e) {
            const errorMsg = `Error processing response: ${(e as Error).message}`;
            console.error(errorMsg);
            setError(errorMsg);
            const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
            setStage('error');
            // stopStreamsAndTTS();
        }
    }, [selectedModel, accessKey, sttLang]); // playGoogleCloudTTSRef and stopStreamsAndTTS are stable via refs/deps

    useEffect(() => { handleUserSpeechRef.current = handleUserSpeech; }, [handleUserSpeech]);


    // 4. startInterview (Initial call to AI)
    const startInterview = useCallback(async () => {
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Connecting to interviewer...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]);
        messageHistoryRef.current = []; // Reset history for a new interview
        try {
            const initialPrompt = "Please begin the interview by introducing yourself and asking the first question.";
            const response = await getBotResponseInterview(initialPrompt, [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);

            if (response.text.startsWith("Error:")) { throw new Error(response.text.substring(7)); }

            const firstBotMessage: Message = { id: Date.now(), text: response.text, sender: 'bot', timestamp: Date.now() };
            messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            setMessages([firstBotMessage]);
            playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US'); // Use Google TTS
        } catch (e) {
            const errorMsg = `Failed to start interview: ${(e as Error).message}`;
            console.error(errorMsg);
            setError(errorMsg);
            setMessages([{ id: Date.now(), text: errorMsg, sender: 'bot', timestamp: Date.now() }]);
            setStage('error');
            // stopStreamsAndTTS(); // Let user close or see error
        }
    }, [selectedModel, accessKey, sttLang]); // playGoogleCloudTTSRef is stable


    // --- Effects ---

    // Setup/Cleanup Effect based on isOpen
    useEffect(() => {
        if (isOpen) {
            console.log("InterviewMode: Effect running for isOpen=true.");
            setStage('idle'); // Reset stage
            startInterviewSetup(); // This will request perms and then move to 'starting'
        } else {
            console.log("InterviewMode: Effect running for isOpen=false. Current stage:", stageRef.current);
            if (stageRef.current !== 'idle') { // If not already idle, cleanup
                stopStreamsAndTTS();
                setStage('idle');
            }
        }
        // Explicit cleanup function for when isOpen becomes false OR component unmounts while open
        return () => {
            if (isOpen) { // Only if it was open when effect ran or unmounted while open
                 console.log("InterviewMode: Cleanup function for isOpen effect (was open).");
                 stopStreamsAndTTS();
                 setStage('idle'); // Ensure idle state on cleanup
            }
        };
    }, [isOpen, startInterviewSetup, stopStreamsAndTTS]); // startInterviewSetup & stopStreamsAndTTS are callbacks


    // Attach Stream to Video Element Effect
    useEffect(() => {
        if (cameraStream && videoRef.current) {
            console.log("InterviewMode: Attaching stream to video element.");
            videoRef.current.srcObject = cameraStream;
            videoRef.current.play().catch(playError => {
                console.error("InterviewMode: Video element play error:", playError);
                setError("Could not play camera video. Please check browser permissions for camera.");
            });
        } else if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        return () => { // Cleanup for this specific effect
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [cameraStream]);

    // STT Setup and Event Handlers Effect
    useEffect(() => {
        if (!recognitionAvailable || !isOpen) {
            if (recognitionRef.current) {
                console.log("STT Effect: Not available or not open, aborting and cleaning up STT.");
                try { recognitionRef.current.abort(); } catch (e) { console.warn("Error aborting STT on close/unavailable:", e); }
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                // Detach all other handlers
                recognitionRef.current.onstart = null;
                recognitionRef.current.onaudiostart = null;
                recognitionRef.current.onsoundstart = null;
                recognitionRef.current.onspeechstart = null;
                recognitionRef.current.onspeechend = null;
                recognitionRef.current.onaudioend = null;
                recognitionRef.current.onnomatch = null;
                recognitionRef.current = null;
                if(isSttActive) setIsSttActive(false);
            }
            return;
        }

        if (!recognitionRef.current) {
            try {
                recognitionRef.current = new SpeechRecognitionImpl();
                recognitionRef.current.continuous = true; // Keep listening until explicitly stopped or end of speech.
                recognitionRef.current.interimResults = false; // We want final results.
                console.log("InterviewMode: STT engine initialized.");
            } catch (err) {
                console.error("Failed to initialize STT engine:", err);
                setError("Failed to initialize Speech Recognition. Your browser might not support it or an extension is blocking it.");
                setStage('error');
                return;
            }
        }

        // (Re)set language if sttLang changes
        try {
            recognitionRef.current.lang = sttLang;
        } catch (e) {
            console.error(`Failed to set STT language to ${sttLang}:`, e);
            setError(`Failed to set STT language. Using default. ${ (e as Error).message }`);
        }

        const onResult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            const trimmedTranscript = finalTranscript.trim();
            console.log("STT Final Transcript:", trimmedTranscript, "Current stage:", stageRef.current);

            if (trimmedTranscript && stageRef.current === 'listening') {
                // Order: Set STT inactive, stop engine, then process.
                setIsSttActive(false); // Indicate STT is no longer capturing
                try {
                    if (recognitionRef.current) recognitionRef.current.stop(); // Stop current session
                } catch (e) { console.warn("STT: error stopping on result", e); }

                setStage('processing_user');
                handleUserSpeechRef.current(trimmedTranscript); // Use ref for stable handler
            } else if (trimmedTranscript && stageRef.current !== 'listening') {
                console.log(`STT received transcript "${trimmedTranscript}" but not in 'listening' stage (was ${stageRef.current}), ignoring.`);
            } else if (!trimmedTranscript) {
                console.log("STT received empty final transcript. Listening may have timed out or no speech.");
                 // Let onend handle transition if STT naturally ends without speech.
            }
        };

        const onError = (event: SpeechRecognitionErrorEvent) => {
            console.error('Interview STT Error:', event.error, event.message);
            let detailedError = `Speech recognition error: ${event.error}.`;
            if (event.error === 'no-speech') detailedError += " No speech was detected. Please ensure your microphone is working and try speaking again.";
            else if (event.error === 'audio-capture') detailedError += " Microphone audio capture failed. Check hardware and browser/OS permissions.";
            else if (event.error === 'not-allowed') detailedError += " Microphone access was denied by you or browser/OS setting. Please grant permission.";
            else if (event.error === 'network') detailedError += " Network error during speech recognition. Check your internet connection.";
            
            setError(detailedError);
            setIsSttActive(false);
            if (stageRef.current === 'listening' || stageRef.current === 'user_turn' || stageRef.current === 'starting') {
                setStage('user_turn'); // Allow user to see error and potentially retry by speaking again (if UI implies)
            }
        };

        const onEnd = () => {
            // This 'onend' is called when recognition stops, either programmatically (.stop()) or naturally (e.g., silence).
            console.log("STT onEnd. Current isSttActive (before this onEnd):", isSttActive, "Current stage:", stageRef.current);
            const wasListening = stageRef.current === 'listening';

            if (isSttActive) { // If STT was still marked active when it ended (e.g. natural end, not via onResult's stop)
                setIsSttActive(false);
            }

            if (wasListening) {
                // If it ended while we were 'listening', it means onResult didn't get a final transcript or handle it.
                // This could be due to silence, or an error that didn't trigger onError but ended recognition.
                console.log("STT ended while in 'listening' stage. No result processed by onResult. Transitioning to user_turn.");
                if(!error) setError("I didn't catch that. Please try speaking again."); // Provide some feedback if no specific error occurred
                setStage('user_turn');
            }
             // If not 'listening', means onResult likely handled it, or it was stopped for other reasons (TTS starting, etc.)
        };

        recognitionRef.current.onresult = onResult;
        recognitionRef.current.onerror = onError;
        recognitionRef.current.onend = onEnd;

        // Optional diagnostic events
        recognitionRef.current.onstart = () => console.log("STT Event: onstart (Recognition service connected and listening)");
        recognitionRef.current.onaudiostart = () => console.log("STT Event: onaudiostart (Browser started capturing audio)");
        recognitionRef.current.onsoundstart = () => console.log("STT Event: onsoundstart (Sound detected by STT engine)");
        recognitionRef.current.onspeechstart = () => console.log("STT Event: onspeechstart (Speech detected by STT engine)");
        recognitionRef.current.onspeechend = () => console.log("STT Event: onspeechend (STT finished detecting speech, processing/onResult may follow)");
        recognitionRef.current.onaudioend = () => console.log("STT Event: onaudioend (Browser finished capturing audio for this session)");
        recognitionRef.current.onnomatch = () => {
            console.log("STT Event: onnomatch (No significant recognition match for the detected speech)");
            if (stageRef.current === 'listening') {
                setError("I didn't understand that. Could you please say it again?");
                setIsSttActive(false); // Ensure STT state is reset
                // recognitionRef.current.stop(); // onEnd should handle the transition
                setStage('user_turn');
            }
        };

        // Cleanup function for this effect
        return () => {
            console.log("Cleaning up STT effect (due to isOpen, sttLang change, or unmount).");
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e) {} // Force stop
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                recognitionRef.current.onstart = null;
                recognitionRef.current.onaudiostart = null;
                recognitionRef.current.onsoundstart = null;
                recognitionRef.current.onspeechstart = null;
                recognitionRef.current.onspeechend = null;
                recognitionRef.current.onaudioend = null;
                recognitionRef.current.onnomatch = null;
                // Don't nullify recognitionRef.current here if STT engine itself is fine, only handlers.
                // It's nullified if !isOpen or !recognitionAvailable at the top of the effect.
            }
            if (isSttActive) setIsSttActive(false); // Final safety net
        };
    }, [isOpen, sttLang, isSttActive]); // isSttActive is included because onEnd needs to know previous state.


    // Effect to auto-start interview flow once permissions are granted and stage is 'starting'
    useEffect(() => {
        if (isOpen && stage === 'starting' && cameraStream) { // Ensure cameraStream is also ready
            startInterview();
        }
    }, [isOpen, stage, cameraStream, startInterview]); // startInterview is a callback


    // Render nothing if parent intends to hide and component is fully idle
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
                        {(stage !== 'idle' && stage !== 'requesting_perms' && cameraStream) ? (
                            <video ref={videoRef} autoPlay playsInline muted={true} />
                        ) : (
                            <div className="placeholder">
                                {stage === 'requesting_perms' ? 'Requesting permissions...'
                                    : stage === 'error' && !cameraStream ? 'Camera/Mic Unavailable'
                                    : 'Camera Off'}
                            </div>
                        )}
                        <p className="interview-notice">
                            {cameraStream ? "Your camera is active for observation." : "Camera is off or unavailable."}
                        </p>
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
                                            <p key={index} style={{ margin: '0 0 0.2em 0' }}>{line || '\u00A0'}</p>
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
                            {stage === 'error' && (error ? "Error occurred." : "An issue occurred.") /* Error displayed above */}
                            {stage === 'user_turn' && "Your Turn (Speak now)"}
                            {stage === 'starting' && "Starting Interview..."}
                            {stage === 'requesting_perms' && "Requesting Permissions..."}
                            {stage === 'processing_user' && "Processing your response..."}
                            {stage === 'idle' && "Initializing..."}
                            {isSttActive && stage === 'listening' && <span className="recording-dot"></span>}
                        </div>
                    </div>
                </div>

                {stage === 'finished' && result && (
                    <div className={`interview-result ${result}`}>
                        Result: {result.toUpperCase()}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="interview-close-button"
                    disabled={stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying)} // Disable if AI is busy
                    title={(stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying)) ? "Wait for AI turn to finish" : (stage === 'finished' ? 'Close' : 'Leave Interview')}
                >
                    {stage === 'finished' || stage === 'error' || stage === 'idle' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
        </div>
    );
}

export default InterviewMode;