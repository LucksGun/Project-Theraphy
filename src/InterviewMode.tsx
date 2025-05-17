// src/InterviewMode.tsx - Complete Code with Stability Fixes

import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage, ApiRequestBody, WORKER_URL } from './App'; // Assuming types and constants
import './InterviewMode.css';

// --- STT/TTS Setup & Browser API Declarations ---
declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;
declare var SpeechRecognitionEvent: {
    prototype: SpeechRecognitionEvent;
    new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent;
};
declare interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;

if (!recognitionAvailable) console.warn("InterviewMode: Speech Recognition not supported by this browser.");

// --- Component Props Interface ---
interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: GeminiModel;
    accessKey: string;
    sttLang: SpeechLanguage;
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
    const recognitionRef = useRef<any>(null);
    const messageHistoryRef = useRef<HistoryItem[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<InterviewStage>(stage);
    const googleTtsAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => { stageRef.current = stage; }, [stage]);

    const handleUserSpeechRef = useRef<(userText: string) => Promise<void>>(async () => {});
    const startListeningRef = useRef<() => void>(() => {});
    const playGoogleCloudTTSRef = useRef<(text: string, lang: string) => Promise<void>>(async () => {});

    const scrollToBottom = useCallback(() => {
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
    }, []);

    useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages, scrollToBottom]);

    const stopStreamsAndTTS = useCallback(() => {
        if (cameraStream) {
            console.log("InterviewMode: Stopping media streams.");
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        if (recognitionRef.current && (isSttActive || recognitionRef.current.recognizing)) { // check recognizing for some browsers
            try {
                console.log("InterviewMode: Stopping STT via stopStreamsAndTTS.");
                recognitionRef.current.abort(); // Use abort for immediate stop
            } catch (e) { console.warn("Error aborting STT:", e); }
        }
         setIsSttActive(false); // Ensure STT state is reset

        if (googleTtsAudioRef.current) {
            console.log("InterviewMode: Stopping Google TTS audio.");
            googleTtsAudioRef.current.pause();
            googleTtsAudioRef.current.currentTime = 0;
            googleTtsAudioRef.current.src = "";
            googleTtsAudioRef.current.onended = null;
            googleTtsAudioRef.current.onerror = null;
        }
        setIsGoogleTtsPlaying(false);
    }, [cameraStream, isSttActive]); // isSttActive ensures this callback updates if STT state changes

    const startInterviewSetup = useCallback(async () => {
        console.log("InterviewMode: startInterviewSetup called.");
        setError(null); // Clear previous errors for a new setup attempt
        setResult(null);
        setMessages([]); // Reset messages for a clean slate
        messageHistoryRef.current = [];
        setStage('requesting_perms');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera/Microphone access (getUserMedia) is not supported by this browser.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            console.log("InterviewMode: Permissions granted, stream obtained.");
            setCameraStream(stream); // Set stream first
            setStage('starting');    // Then set stage to trigger interview start
        } catch (err) {
            console.error("InterviewMode: Permission Error:", err);
            let errMsg = `Error accessing camera/microphone: ${(err as Error).message}.`;
            if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') { errMsg += " Please grant permissions in browser settings."; }
            else if ((err as Error).name === 'NotFoundError' || (err as Error).name === 'DevicesNotFoundError') { errMsg += " No camera/microphone found."; }
            setError(errMsg);
            setStage('error');
            if (cameraStream) stopStreamsAndTTS(); // Ensure stream is stopped if obtained then error
            else setCameraStream(null);
        }
    }, [stopStreamsAndTTS]); // Added stopStreamsAndTTS dependency

    const startListening = useCallback(() => {
        if (isGoogleTtsPlaying && googleTtsAudioRef.current) {
            console.log("startListening: Stopping active Google TTS audio before listening.");
            googleTtsAudioRef.current.pause();
            googleTtsAudioRef.current.currentTime = 0;
            setIsGoogleTtsPlaying(false);
        }
        if (!recognitionRef.current) {
            console.warn("Cannot start STT: Recognition engine not initialized. Current stage:", stageRef.current);
            if (stageRef.current !== 'error') { // Avoid setting error if already in one from STT init
                 setError("Microphone input is not ready. Please ensure permissions are granted.");
                 setStage('error');
            }
            return;
        }
        if (isSttActive) {
            console.warn("Cannot start STT: Already active.");
            return;
        }
        // Only allow starting listening if it's explicitly the user's turn.
        if (stageRef.current !== 'user_turn') {
            console.warn(`Cannot start STT: Not user's turn. Current stage: ${stageRef.current}.`);
            if (stageRef.current === 'ai_speaking') { // TTS might have been cut short
                console.log("Attempting to listen after AI speaking stage was interrupted. Forcing to user_turn.");
                setStage('user_turn');
                 // Do not immediately call startListening again, let the stage update, then user action or next UI cue.
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
            setStage('error');
        }
    }, [isSttActive, sttLang, isGoogleTtsPlaying]);

    useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

    const playGoogleCloudTTS = useCallback(async (text: string, lang: string) => {
        if (stageRef.current === 'error') {
            console.warn("playGoogleCloudTTS: Aborting TTS play because current stage is 'error'.");
            return;
        }
        if (!text) {
            console.warn("Google TTS: Text is empty. Moving to user turn.");
            setStage('user_turn');
            setTimeout(() => startListeningRef.current(), 300);
            return;
        }
        if (isSttActive && recognitionRef.current) {
            console.log("playGoogleCloudTTS: STT is active, stopping it first.");
            try { recognitionRef.current.abort(); } catch(e) { console.warn("Error aborting STT before TTS:", e); }
            setIsSttActive(false);
        }
        console.log("InterviewMode: Preparing to play AI response via Google Cloud TTS...");
        setStage('ai_speaking');
        setIsGoogleTtsPlaying(true);
        setError(null);
        try {
            const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '');
            const ttsRequestBody = {
                action: 'synthesize_speech', text: cleanText, languageCode: lang, accessKey: accessKey,
            };
            const response = await fetch(WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ttsRequestBody)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Google TTS API Error via Worker: ${response.status}` }));
                throw new Error(errorData.error || `Google TTS API Error via Worker: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.error) throw new Error(responseData.error);
            if (!responseData.audioContent && !responseData.audioUrl) {
                throw new Error("No audio content/URL received from Google TTS service via worker.");
            }
            if (googleTtsAudioRef.current) {
                googleTtsAudioRef.current.onended = null; googleTtsAudioRef.current.onerror = null; googleTtsAudioRef.current.src = "";
            }
            const audio = googleTtsAudioRef.current || new Audio();
            googleTtsAudioRef.current = audio;
            if (responseData.audioUrl) audio.src = responseData.audioUrl;
            else if (responseData.audioContent) audio.src = `data:audio/mp3;base64,${responseData.audioContent}`;

            audio.onended = () => {
                setIsGoogleTtsPlaying(false);
                if (stageRef.current === 'ai_speaking') {
                    console.log("InterviewMode: Google TTS finished normally.");
                    if (result) { // If interview already has a final result (e.g. AI announced Pass/Fail)
                        setStage('finished');
                    } else {
                        setStage('user_turn');
                        setTimeout(() => startListeningRef.current(), 300);
                    }
                } else { console.log("InterviewMode: Google TTS 'onended' fired but stage was " + stageRef.current + ". Ignoring."); }
            };
            audio.onerror = (e) => {
                setIsGoogleTtsPlaying(false);
                console.error('Interview Google TTS Playback Error:', e);
                setError(`Speech synthesis playback error. The AI's response might not have been spoken.`);
                // If TTS playback fails, don't get stuck in ai_speaking. Move to a resolvable state.
                if (stageRef.current === 'ai_speaking') {
                    if (result) setStage('finished'); // If there was a result, go to finished.
                    else setStage('user_turn'); // Otherwise, allow user to try again or see error and close.
                }
            };
            console.log("InterviewMode: Calling audio.play() for Google TTS.");
            await audio.play();
        } catch (error) {
            setIsGoogleTtsPlaying(false);
            const specificErrorMessage = (error as Error).message || "Unknown TTS error during fetch/setup";
            console.error('Google Cloud TTS setup/fetch error:', specificErrorMessage);
            setError(`Google TTS Error: ${specificErrorMessage}. The AI's response could not be spoken.`);
            setStage('error'); // Critical TTS failure leads to error stage.
        }
    }, [accessKey, isSttActive, result]); // Added result to deps for onended logic

    useEffect(() => { playGoogleCloudTTSRef.current = playGoogleCloudTTS; }, [playGoogleCloudTTS]);

    const handleUserSpeech = useCallback(async (userText: string) => {
        if (stageRef.current === 'error') {
            console.warn("handleUserSpeech: Aborting because current stage is 'error'.");
            return;
        }
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
            if (!response.text.startsWith("Error:")) {
                messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            } else {
                console.error("API returned error:", response.text);
                setError(response.text);
            }
            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);
            let endResult: InterviewResult = null;
            const lowerText = response.text.toLowerCase();
            if (lowerText.includes("conclusion: pass") || lowerText.includes("final result: pass") || lowerText.includes("outcome: pass")) { endResult = 'pass'; }
            else if (lowerText.includes("conclusion: fail") || lowerText.includes("final result: fail") || lowerText.includes("outcome: fail")) { endResult = 'fail'; }

            if (endResult) {
                console.log("InterviewMode: Interview finished by Gemini. Result:", endResult);
                setResult(endResult); // Set result state
                // AI will speak the final result, playGoogleCloudTTSRef onended will set stage to 'finished'
            }
            if (response.text.startsWith("Error:")) {
                setStage('error'); // API error from Gemini
            } else {
                // If no error, AI responds. TTS onended will transition stage.
                playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US');
            }
        } catch (e) {
            const errorMsg = `Error processing Gemini response: ${(e as Error).message}`;
            console.error(errorMsg);
            setError(errorMsg);
            const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
            setStage('error');
        }
    }, [selectedModel, accessKey, sttLang]);

    useEffect(() => { handleUserSpeechRef.current = handleUserSpeech; }, [handleUserSpeech]);

    const startInterview = useCallback(async () => {
        if (stageRef.current === 'error') {
             console.warn("startInterview: Aborting because current stage is 'error'.");
             return;
        }
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Connecting to interviewer...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]);
        messageHistoryRef.current = [];
        try {
            const initialPrompt = "Please begin the interview by introducing yourself and asking the first question.";
            const response = await getBotResponseInterview(initialPrompt, [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
            if (response.text.startsWith("Error:")) { throw new Error(response.text.substring(7)); }
            const firstBotMessage: Message = { id: Date.now(), text: response.text, sender: 'bot', timestamp: Date.now() };
            messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            setMessages([firstBotMessage]);
            playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US');
        } catch (e) {
            const errorMsg = `Failed to start interview: ${(e as Error).message}`;
            console.error(errorMsg);
            setError(errorMsg);
            setMessages([{ id: Date.now(), text: errorMsg, sender: 'bot', timestamp: Date.now() }]);
            setStage('error'); // Critical failure during start
        }
    }, [selectedModel, accessKey, sttLang]);

    useEffect(() => {
        if (isOpen) {
            console.log("InterviewMode: isOpen is true. Resetting and starting setup.");
            setMessages([]); messageHistoryRef.current = []; setError(null); setResult(null);
            // setCameraStream(null); // Handled by stopStreamsAndTTS if needed
            setStage('idle');
            startInterviewSetup();
        } else {
            console.log("InterviewMode: isOpen is false. Cleaning up.");
            stopStreamsAndTTS();
            setStage('idle');
        }
        return () => {
            console.log("InterviewMode: Cleanup for isOpen effect or unmount. Current stage was:", stageRef.current);
            if (stageRef.current !== 'idle') {
                stopStreamsAndTTS();
                setStage('idle');
            }
        };
    }, [isOpen, startInterviewSetup, stopStreamsAndTTS]); // startInterviewSetup is stable, stopStreamsAndTTS deps are managed

    useEffect(() => {
        const videoElement = videoRef.current;
        if (cameraStream && videoElement) {
            videoElement.srcObject = cameraStream;
            videoElement.play().catch(playError => {
                console.error("InterviewMode: Video element play error:", playError.name, playError.message);
                if (playError.name !== 'AbortError') { // Only set critical error if it's not a common AbortError
                    setError("Could not play camera video. Please check browser permissions.");
                    // Don't set stage to 'error' here unless video is absolutely critical path that can't be recovered.
                    // The user might still be able to proceed with audio only if STT/TTS works.
                }
            });
        } else if (videoElement) { videoElement.srcObject = null; }
        return () => { if (videoElement) { videoElement.pause(); videoElement.srcObject = null; }};
    }, [cameraStream]);

    useEffect(() => {
        if (!recognitionAvailable || !isOpen) {
            if (recognitionRef.current) {
                console.log("STT Effect: Not available or not open, aborting and cleaning up STT.");
                try { recognitionRef.current.abort(); } catch (e) { console.warn("Error aborting STT on close/unavailable:", e); }
                recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onend = null;
                recognitionRef.current.onstart = null; recognitionRef.current.onaudiostart = null; recognitionRef.current.onsoundstart = null;
                recognitionRef.current.onspeechstart = null; recognitionRef.current.onspeechend = null; recognitionRef.current.onaudioend = null;
                recognitionRef.current.onnomatch = null;
                // recognitionRef.current = null; // Keep instance if re-opening, just remove handlers. Nullify if fully closing.
                                               // For now, let's nullify to ensure clean state on re-open if STT had issues.
                if(isOpen) console.warn("STT being nullified while isOpen is true - likely due to !recognitionAvailable"); else recognitionRef.current = null;

                if(isSttActive) setIsSttActive(false);
            }
            return;
        }
        if (!recognitionRef.current) {
            try {
                recognitionRef.current = new SpeechRecognitionImpl();
                recognitionRef.current.continuous = true; recognitionRef.current.interimResults = false;
                console.log("InterviewMode: STT engine initialized.");
            } catch (err) {
                console.error("Failed to initialize STT engine:", err);
                setError("Failed to initialize Speech Recognition. Your browser might not support it.");
                setStage('error'); return;
            }
        }
        try { recognitionRef.current.lang = sttLang; }
        catch (e) { console.error(`Failed to set STT language to ${sttLang}:`, e); setError(`Failed to set STT language. ${ (e as Error).message }`); }

        const onResult = (event: SpeechRecognitionEvent) => { /* ... see previous correct implementation ... */
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript; }}
            const trimmedTranscript = finalTranscript.trim();
            console.log("STT Final Transcript:", trimmedTranscript, "Current stage:", stageRef.current);
            if (trimmedTranscript && stageRef.current === 'listening') {
                setIsSttActive(false);
                try { if (recognitionRef.current) recognitionRef.current.stop(); } catch(e){ console.warn("STT: error stopping on result", e); }
                setStage('processing_user');
                handleUserSpeechRef.current(trimmedTranscript);
            } else if (trimmedTranscript && stageRef.current !== 'listening') { console.log(`STT result ignored (not listening): "${trimmedTranscript}"`);}
            else if (!trimmedTranscript) { console.log("STT empty final transcript."); }
        };
        const onError = (event: SpeechRecognitionErrorEvent) => { /* ... see previous correct implementation ... */
            console.error('Interview STT Error:', event.error, event.message);
            let detailedError = `Speech recognition error: ${event.error}.`;
            if (event.error === 'no-speech') detailedError += " No speech detected.";
            else if (event.error === 'audio-capture') detailedError += " Mic audio capture failed.";
            else if (event.error === 'not-allowed') detailedError += " Mic access denied.";
            else if (event.error === 'network') detailedError += " Network error in STT.";
            setError(detailedError); setIsSttActive(false);
            if (stageRef.current === 'listening' || stageRef.current === 'user_turn') setStage('user_turn');
        };
        const onEnd = () => { /* ... see previous correct implementation ... */
            console.log("STT onEnd. Was active:", isSttActive, "Current stage:", stageRef.current);
            const wasListening = stageRef.current === 'listening';
            if (isSttActive) setIsSttActive(false); // Ensure state reflects STT is off
            if (wasListening) { // If ended unexpectedly while listening
                console.log("STT ended while 'listening'. No result or timeout. To user_turn.");
                if(!error && stageRef.current === 'listening') setError("I didn't catch that. Please try again.");
                setStage('user_turn');
            }
        };
        recognitionRef.current.onresult = onResult; recognitionRef.current.onerror = onError; recognitionRef.current.onend = onEnd;
        recognitionRef.current.onstart = () => console.log("STT Event: onstart");
        recognitionRef.current.onaudiostart = () => console.log("STT Event: onaudiostart");
        recognitionRef.current.onsoundstart = () => console.log("STT Event: onsoundstart");
        recognitionRef.current.onspeechstart = () => console.log("STT Event: onspeechstart");
        recognitionRef.current.onspeechend = () => console.log("STT Event: onspeechend");
        recognitionRef.current.onaudioend = () => console.log("STT Event: onaudioend");
        recognitionRef.current.onnomatch = () => {
            console.log("STT Event: onnomatch");
            if (stageRef.current === 'listening') { setError("I didn't understand. Try again?"); setStage('user_turn'); if (isSttActive) setIsSttActive(false);}
        };
        return () => {
            console.log("Cleaning up STT effect.");
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e) {}
                recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onend = null;
                // ... detach other handlers ...
            }
            // if (isSttActive) setIsSttActive(false); // Already handled by onEnd or abort
        };
    }, [isOpen, sttLang]); // Removed isSttActive from here, onEnd logic handles it.

    useEffect(() => {
        if (isOpen && stage === 'starting' && cameraStream && stageRef.current !== 'error') {
            startInterview();
        }
    }, [isOpen, stage, cameraStream, startInterview]);

    if (!isOpen && stage === 'idle') return null;

    return (
        <div className="interview-mode-overlay">
            <div className="interview-mode-modal">
                <h3>University Entrance Interview Simulation</h3>
                {error && <p className="interview-error">{error}</p>}
                <div className="interview-layout">
                    <div className="interview-camera-view">
                        {(stage !== 'idle' && stage !== 'requesting_perms' && cameraStream) ? (
                            <video ref={videoRef} autoPlay playsInline muted={true} />
                        ) : (
                            <div className="placeholder">
                                {stage === 'requesting_perms' ? 'Requesting permissions...'
                                    : (stage === 'error' && !cameraStream) ? 'Camera/Mic Unavailable'
                                    : 'Camera Off'}
                            </div>
                        )}
                        <p className="interview-notice">
                            {cameraStream ? "Your camera is active." : "Camera is off or unavailable."}
                        </p>
                    </div>
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
                        <div className="interview-status">
                            {stage === 'listening' && "Listening..."}
                            {stage === 'ai_thinking' && "Interviewer Thinking..."}
                            {stage === 'ai_speaking' && "Interviewer Speaking..."}
                            {stage === 'finished' && `Interview Finished: ${result ? result.toUpperCase() : 'Concluded'}`}
                            {stage === 'error' && (error ? "Error occurred." : "An issue occurred.")}
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
                    <div className={`interview-result ${result}`}>Result: {result.toUpperCase()}</div>
                )}
                <button
                    onClick={onClose}
                    className="interview-close-button"
                    disabled={stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying)}
                    title={(stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying)) ? "Wait for AI" : (stage === 'finished' ? 'Close' : 'Leave Interview')}
                >
                    {stage === 'finished' || stage === 'error' || stage === 'idle' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
        </div>
    );
}

export default InterviewMode;