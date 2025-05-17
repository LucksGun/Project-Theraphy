// src/InterviewMode.tsx - Now using Google Cloud STT via Backend

import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage, ApiRequestBody, WORKER_URL } from './App';
import './InterviewMode.css';

// --- Constants ---
const INTERVIEWER_PERSONA_ID = 'interviewer';
const MAX_RECORDING_DURATION = 15000; // 15 seconds for user to speak
const PREFERRED_AUDIO_MIME_TYPE = 'audio/webm;codecs=opus'; // Opus is good for quality & size
const FALLBACK_AUDIO_MIME_TYPE = 'audio/webm'; // Browser default if Opus not supported
const GOOGLE_STT_AUDIO_ENCODING_OPUS = 'WEBM_OPUS'; // What Google STT expects for webm/opus
const GOOGLE_STT_AUDIO_ENCODING_DEFAULT = 'WEBM_OPUS'; // Assuming fallback is also webm based
// We can try to get sampleRate from stream, but for Opus, Google often infers it.
// const TARGET_SAMPLE_RATE_HERTZ = 48000; // Common sample rate

// --- Component Props Interface ---
interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModel: GeminiModel;
    accessKey: string;
    sttLang: SpeechLanguage; // e.g., "th-TH", "en-US"
}

// --- Types for Interview ---
type InterviewStage =
    | 'idle'
    | 'requesting_perms'
    | 'starting'
    | 'listening' // User is speaking, audio is being recorded
    | 'processing_stt_audio' // Audio sent to backend for transcription
    | 'processing_user' // Transcript received, now sending to Gemini (renamed from original)
    | 'ai_thinking'
    | 'ai_speaking'
    | 'finished'
    | 'error'
    | 'user_turn'; // Ready for user to start speaking

type InterviewResult = 'pass' | 'fail' | null;
type HistoryItem = { role: 'user' | 'model'; parts: { text: string }[] };

// --- Reusable fetch logic for Gemini ---
async function getBotResponseInterview(
    userInput: string,
    history: HistoryItem[],
    model: GeminiModel,
    persona: string,
    accessKey: string
): Promise<{ text: string; imageUrl: string | null }> {
    const requestBody: ApiRequestBody = {
        action: 'chat', prompt: userInput, model: model, persona: persona as any, accessKey: accessKey || undefined, history: history,
    };
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            let errorBody = { error: `API Error: ${response.status}` };
            try { errorBody = await response.json(); } catch (e) { console.warn("Could not parse error response body"); }
            throw new Error(errorBody?.error || `API Error: ${response.status}`);
        }
        const responseData = await response.json();
        if (responseData.error) throw new Error(responseData.error);
        return { text: responseData.reply || '', imageUrl: responseData.imageUrl || null };
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
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null); // Includes audio
    const [error, setError] = useState<string | null>(null);
    const [isSttActive, setIsSttActive] = useState(false); // True when MediaRecorder is recording
    const [isGoogleTtsPlaying, setIsGoogleTtsPlaying] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messageHistoryRef = useRef<HistoryItem[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<InterviewStage>(stage);
    const googleTtsAudioRef = useRef<HTMLAudioElement | null>(null);
    const initialSessionSetupDone = useRef(false);
    const currentAudioConfig = useRef<{ mimeType: string, encoding: string, sampleRate?: number }>({
        mimeType: PREFERRED_AUDIO_MIME_TYPE,
        encoding: GOOGLE_STT_AUDIO_ENCODING_OPUS,
    });

    useEffect(() => { stageRef.current = stage; }, [stage]);

    const handleUserSpeechRef = useRef<(userText: string) => Promise<void>>(async () => {});
    const startListeningRef = useRef<() => void>(() => {});
    const playGoogleCloudTTSRef = useRef<(text: string, lang: string) => Promise<void>>(async () => {});

    const scrollToBottom = useCallback(() => {
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
    }, []);

    useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages, scrollToBottom]);

    const stopRecordingAndClearData = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop(); // This will trigger 'onstop'
        }
        if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
        }
        setIsSttActive(false); // Mark as not active
        audioChunksRef.current = []; // Clear previous chunks
    }, []);


    const stopStreamsAndTTS = useCallback(() => {
        stopRecordingAndClearData(); // Stop MediaRecorder if active

        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        // No SpeechRecognition specific cleanup needed anymore

        if (googleTtsAudioRef.current) {
            googleTtsAudioRef.current.pause(); googleTtsAudioRef.current.currentTime = 0;
            googleTtsAudioRef.current.src = ""; googleTtsAudioRef.current.onended = null; googleTtsAudioRef.current.onerror = null;
        }
        setIsGoogleTtsPlaying(false);
    }, [cameraStream, stopRecordingAndClearData]); // stopRecordingAndClearData is stable

    const startInterviewSetup = useCallback(async () => {
        console.log("InterviewMode: startInterviewSetup called.");
        setStage('requesting_perms');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera/Microphone access (getUserMedia) is not supported.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            console.log("InterviewMode: Permissions granted, stream obtained.");

            // Determine supported MIME type
            if (MediaRecorder.isTypeSupported(PREFERRED_AUDIO_MIME_TYPE)) {
                currentAudioConfig.current.mimeType = PREFERRED_AUDIO_MIME_TYPE;
                currentAudioConfig.current.encoding = GOOGLE_STT_AUDIO_ENCODING_OPUS;
            } else if (MediaRecorder.isTypeSupported(FALLBACK_AUDIO_MIME_TYPE)) {
                currentAudioConfig.current.mimeType = FALLBACK_AUDIO_MIME_TYPE;
                currentAudioConfig.current.encoding = GOOGLE_STT_AUDIO_ENCODING_DEFAULT; // Needs adjustment if not opus
            } else {
                console.warn("InterviewMode: Neither preferred nor fallback MIME type supported for MediaRecorder.");
                // Fallback to browser default, encoding might be unknown or need to be LINEAR16 if raw
                currentAudioConfig.current.mimeType = ''; // Let browser pick
                currentAudioConfig.current.encoding = 'LINEAR16'; // Assume raw if unknown, requires sampleRate
            }
            console.log("InterviewMode: Using audio config:", currentAudioConfig.current);

            // Try to get sample rate from the audio track
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                const settings = audioTracks[0].getSettings();
                if (settings.sampleRate) {
                    currentAudioConfig.current.sampleRate = settings.sampleRate;
                    console.log("InterviewMode: Detected audio sample rate:", settings.sampleRate);
                }
            }

            setCameraStream(stream);
            setStage('starting');
        } catch (err) {
            console.error("InterviewMode: Permission Error in startInterviewSetup:", err);
            let errMsg = `Error accessing camera/microphone: ${(err as Error).message}.`;
            if ((err as Error).name === 'NotAllowedError') { errMsg += " Please grant permissions."; }
            else if ((err as Error).name === 'NotFoundError') { errMsg += " No camera/microphone found."; }
            setError(errMsg); setStage('error'); setCameraStream(null); initialSessionSetupDone.current = true;
        }
    }, []);

    useEffect(() => { // Main lifecycle effect for isOpen
        if (isOpen) {
            if (!initialSessionSetupDone.current) {
                console.log("InterviewMode: isOpen is true AND initial session setup not done. Resetting and starting setup.");
                setMessages([]); messageHistoryRef.current = []; setError(null); setResult(null);
                stopStreamsAndTTS();
                setStage('idle'); startInterviewSetup(); initialSessionSetupDone.current = true;
            }
        } else {
            if (initialSessionSetupDone.current || stageRef.current !== 'idle') {
                console.log("InterviewMode: isOpen is false. Cleaning up active session.");
                stopStreamsAndTTS(); setStage('idle'); initialSessionSetupDone.current = false;
            }
        }
        return () => { // Only for unmount
            if (isOpen && stageRef.current !== 'idle') {
                console.log("InterviewMode: Component unmounting while active. Performing cleanup.");
                stopStreamsAndTTS();
            }
        };
    }, [isOpen, startInterviewSetup, stopStreamsAndTTS]);

    const stopListeningAndProcessAudio = useCallback(async () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            console.log("InterviewMode: Stopping recording and processing audio.");
            mediaRecorderRef.current.stop(); // This will trigger 'onstop'
        }
        if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
        }
        setIsSttActive(false);
        if (stageRef.current === 'listening') { // Only transition if we were actually listening
            setStage('processing_stt_audio');
        }
    }, []);

    const startListening = useCallback(() => {
        if (stageRef.current === 'error' && initialSessionSetupDone.current) { console.warn("startListening: Aborted, initial setup failed."); return; }
        if (isGoogleTtsPlaying && googleTtsAudioRef.current) {
            console.log("startListening: Stopping active Google TTS audio.");
            googleTtsAudioRef.current.pause(); googleTtsAudioRef.current.currentTime = 0; setIsGoogleTtsPlaying(false);
        }
        if (!cameraStream) {
            console.error("startListening: Cannot start, cameraStream (audio source) is not available.");
            setError("Microphone source not available."); setStage('error'); initialSessionSetupDone.current = true;
            return;
        }
        if (isSttActive || (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording")) {
            console.warn("startListening: Already recording."); return;
        }
        if (stageRef.current !== 'user_turn') {
            console.warn(`startListening: Not user's turn. Stage: ${stageRef.current}.`);
            if (stageRef.current === 'ai_speaking') { console.log("Forcing to user_turn."); setStage('user_turn');}
            return;
        }

        console.log(`InterviewMode: Starting audio recording for STT. Lang: ${sttLang}`);
        setError(null); setStage('listening'); audioChunksRef.current = [];

        try {
            const options = { mimeType: currentAudioConfig.current.mimeType };
            mediaRecorderRef.current = new MediaRecorder(cameraStream, currentAudioConfig.current.mimeType ? options : undefined);

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                console.log("InterviewMode: MediaRecorder stopped. Processing audio chunks.");
                if (audioChunksRef.current.length === 0) {
                    console.warn("InterviewMode: No audio chunks recorded.");
                    setError("I didn't hear anything. Please try speaking again.");
                    setStage('user_turn'); // Go back to user's turn
                    return;
                }

                const audioBlob = new Blob(audioChunksRef.current, { type: currentAudioConfig.current.mimeType });
                audioChunksRef.current = []; // Clear for next recording

                // Convert Blob to base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64AudioData = reader.result as string; // e.g., "data:audio/webm;base64,XXXX..."
                    // console.log("InterviewMode: Base64 audio data ready. Sending for transcription.");

                    try {
                        const sttRequestBody = {
                            action: 'transcribe_speech',
                            audioData: base64AudioData, // Worker's extractBase64 will handle data URL prefix
                            languageCode: sttLang,
                            audioEncoding: currentAudioConfig.current.encoding,
                            sampleRateHertz: currentAudioConfig.current.sampleRate, // Optional for Opus, but good to send if known
                            accessKey: accessKey,
                        };
                        const sttResponse = await fetch(WORKER_URL, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sttRequestBody)
                        });
                        if (!sttResponse.ok) {
                            const errData = await sttResponse.json().catch(() => ({error: `STT API Error: ${sttResponse.status}`}));
                            throw new Error(errData.error || `STT API Error: ${sttResponse.status}`);
                        }
                        const transcriptData = await sttResponse.json();
                        if (transcriptData.error) throw new Error(transcriptData.error);

                        if (transcriptData.transcript && transcriptData.transcript.trim().length > 0) {
                            console.log("InterviewMode: Transcript received:", transcriptData.transcript);
                            setStage('processing_user'); // Stage before calling Gemini
                            handleUserSpeechRef.current(transcriptData.transcript);
                        } else {
                            console.warn("InterviewMode: Empty transcript received from STT.");
                            setError("I couldn't understand what was said. Please try again.");
                            setStage('user_turn');
                        }
                    } catch (transcribeError) {
                        console.error("InterviewMode: Error during transcription request:", transcribeError);
                        setError(`Transcription failed: ${(transcribeError as Error).message}`);
                        setStage('user_turn'); // Allow user to try again
                    }
                };
                reader.onerror = (readError) => {
                    console.error("InterviewMode: Error reading audio blob as base64:", readError);
                    setError("Failed to process recorded audio.");
                    setStage('user_turn');
                };
            };
            mediaRecorderRef.current.onerror = (event: Event) => {
                console.error("InterviewMode: MediaRecorder error", event);
                setError(`Microphone recording error: ${(event as any)?.error?.name || 'Unknown recording error'}`);
                setIsSttActive(false);
                setStage('error'); // A MediaRecorder error is usually critical for the current attempt
                initialSessionSetupDone.current = true;
            };

            mediaRecorderRef.current.start();
            setIsSttActive(true);
            console.log("InterviewMode: MediaRecorder started.");

            // Automatically stop recording after a duration
            if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = setTimeout(() => {
                console.log("InterviewMode: Max recording duration reached. Stopping recorder.");
                stopListeningAndProcessAudio();
            }, MAX_RECORDING_DURATION);

        } catch (e) {
            console.error("Error starting MediaRecorder:", e);
            setError(`Could not start microphone recording: ${(e as Error).message}.`);
            setIsSttActive(false); setStage('error'); initialSessionSetupDone.current = true;
        }
    }, [cameraStream, sttLang, accessKey, isGoogleTtsPlaying, stopListeningAndProcessAudio]);

    useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

    const playGoogleCloudTTS = useCallback(async (text: string, lang: string) => {
        if (isSttActive) { // If user was somehow still recording when AI is about to speak
            console.warn("playGoogleCloudTTS: User STT was active. Stopping and processing it first.");
            await stopListeningAndProcessAudio(); // Wait for it to process before AI speaks
        }
        if (stageRef.current === 'error' && initialSessionSetupDone.current) { return; }
        if (!text) { setStage('user_turn'); setTimeout(() => startListeningRef.current(), 300); return; }

        setStage('ai_speaking'); setIsGoogleTtsPlaying(true); setError(null);
        try {
            const cleanText = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '');
            const ttsRequestBody = { action: 'synthesize_speech', text: cleanText, languageCode: lang, accessKey: accessKey };
            const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ttsRequestBody) });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `TTS Worker Error: ${response.status}` }));
                throw new Error(errorData.error || `TTS Worker Error: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.error) throw new Error(responseData.error);
            if (!responseData.audioContent && !responseData.audioUrl) throw new Error("No audio from TTS worker.");

            if (googleTtsAudioRef.current) { googleTtsAudioRef.current.onended = null; googleTtsAudioRef.current.onerror = null; googleTtsAudioRef.current.src = "";}
            const audio = googleTtsAudioRef.current || new Audio(); googleTtsAudioRef.current = audio;
            if (responseData.audioUrl) audio.src = responseData.audioUrl; else if (responseData.audioContent) audio.src = `data:audio/mp3;base64,${responseData.audioContent}`;

            audio.onended = () => {
                setIsGoogleTtsPlaying(false);
                if (stageRef.current === 'ai_speaking') {
                    if (result) { setStage('finished'); }
                    else { setStage('user_turn'); setTimeout(() => startListeningRef.current(), 300); }
                }
            };
            audio.onerror = (e) => {
                setIsGoogleTtsPlaying(false); console.error('TTS Playback Error:', e); setError(`TTS playback error.`);
                if (stageRef.current === 'ai_speaking') { if (result) setStage('finished'); else setStage('user_turn');}
            };
            await audio.play();
        } catch (error) {
            setIsGoogleTtsPlaying(false); const msg = (error as Error).message; console.error('TTS fetch/setup error:', msg);
            setError(`TTS Error: ${msg}.`); setStage('error'); initialSessionSetupDone.current = true;
        }
    }, [accessKey, isSttActive, result, stopListeningAndProcessAudio]);

    useEffect(() => { playGoogleCloudTTSRef.current = playGoogleCloudTTS; }, [playGoogleCloudTTS]);

    const handleUserSpeech = useCallback(async (userText: string) => {
        if (stageRef.current === 'error' && initialSessionSetupDone.current) { return; }
        console.log("InterviewMode: Handling user transcript:", userText);
        const userMessage: Message = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]); messageHistoryRef.current.push({ role: 'user', parts: [{ text: userText }] });
        setStage('ai_thinking'); // Different from processing_user (which was STT -> Gemini)
        const loadingMessage: Message = { id: Date.now() + 1, text: "...", sender: 'loading', timestamp: Date.now() + 1 };
        setMessages(prev => [...prev, loadingMessage]);
        const historyForApi = messageHistoryRef.current.slice(-10);
        try {
            const response = await getBotResponseInterview(userText, historyForApi, selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
            const botMessage: Message = { id: Date.now() + 2, text: response.text, sender: 'bot', timestamp: Date.now() + 2 };
            if (!response.text.startsWith("Error:")) messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            else { console.error("Gemini API error:", response.text); setError(response.text); }
            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), botMessage]);

            let endResult: InterviewResult = null;
            const lowerText = response.text.toLowerCase();
            if (lowerText.includes("conclusion: pass") || lowerText.includes("final result: pass")) { endResult = 'pass'; }
            else if (lowerText.includes("conclusion: fail") || lowerText.includes("final result: fail")) { endResult = 'fail'; }

            if (endResult) { console.log("InterviewMode: Gemini decided interview result:", endResult); setResult(endResult); }
            if (response.text.startsWith("Error:")) { setStage('error'); initialSessionSetupDone.current = true; }
            else { playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US');}
        } catch (e) {
            const errorMsg = `Error with Gemini response: ${(e as Error).message}`; console.error(errorMsg); setError(errorMsg);
            const errorMessage: Message = { id: Date.now() + 2, text: errorMsg, sender: 'bot', timestamp: Date.now() + 2 };
            setMessages(prev => [...prev.filter(m => m.sender !== 'loading'), errorMessage]);
            setStage('error'); initialSessionSetupDone.current = true;
        }
    }, [selectedModel, accessKey, sttLang]);

    useEffect(() => { handleUserSpeechRef.current = handleUserSpeech; }, [handleUserSpeech]);

    const startInterview = useCallback(async () => {
        if (stageRef.current === 'error' && initialSessionSetupDone.current) { return;}
        console.log("InterviewMode: Starting interview flow...");
        setStage('ai_thinking');
        const startMessage: Message = { id: Date.now(), text: "Connecting...", sender: 'loading', timestamp: Date.now() };
        setMessages([startMessage]); messageHistoryRef.current = [];
        try {
            const initialPrompt = "Please begin the interview.";
            const response = await getBotResponseInterview(initialPrompt, [], selectedModel, INTERVIEWER_PERSONA_ID, accessKey);
            if (response.text.startsWith("Error:")) { throw new Error(response.text.substring(7)); }
            const firstBotMessage: Message = { id: Date.now(), text: response.text, sender: 'bot', timestamp: Date.now() };
            messageHistoryRef.current.push({ role: 'model', parts: [{ text: response.text }] });
            setMessages([firstBotMessage]);
            playGoogleCloudTTSRef.current(response.text, sttLang.startsWith('th') ? 'th-TH' : 'en-US');
        } catch (e) {
            const errorMsg = `Failed to start interview: ${(e as Error).message}`; console.error(errorMsg); setError(errorMsg);
            setMessages([{ id: Date.now(), text: errorMsg, sender: 'bot', timestamp: Date.now() }]);
            setStage('error'); initialSessionSetupDone.current = true;
        }
    }, [selectedModel, accessKey, sttLang]);

    useEffect(() => { // Effect to attach stream to video element
        const videoElement = videoRef.current;
        if (cameraStream && videoElement) {
            videoElement.srcObject = cameraStream;
            videoElement.play().catch(playError => {
                if (playError.name !== 'AbortError') { console.error("Video play error:", playError); setError("Could not play camera video."); }
            });
        } else if (videoElement) { videoElement.srcObject = null; }
        return () => { if (videoElement) { videoElement.pause(); videoElement.srcObject = null; }};
    }, [cameraStream]);


    useEffect(() => { // Effect to auto-start interview flow
        if (isOpen && stage === 'starting' && cameraStream && !(stageRef.current === 'error' && initialSessionSetupDone.current)) {
            startInterview();
        }
    }, [isOpen, stage, cameraStream, startInterview]);

    if (!isOpen && !initialSessionSetupDone.current && stage === 'idle') return null;

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
                                    : (stage === 'error' && initialSessionSetupDone.current && !cameraStream) ? 'Camera/Mic Unavailable'
                                    : 'Camera Off'}
                            </div>
                        )}
                        <p className="interview-notice">
                            {cameraStream ? "Your camera is active." : (stage === 'error' && initialSessionSetupDone.current ? "Camera setup failed." : "Camera is off.")}
                        </p>
                    </div>
                    <div className="interview-chat-view">
                        {/* ... messages map ... */}
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
                            {stage === 'listening' && "Listening (Rec ends in " + MAX_RECORDING_DURATION/1000 + "s)..."}
                            {stage === 'processing_stt_audio' && "Processing your audio..."}
                            {stage === 'ai_thinking' && "Interviewer Thinking..."}
                            {stage === 'ai_speaking' && "Interviewer Speaking..."}
                            {stage === 'finished' && `Interview Finished: ${result ? result.toUpperCase() : 'Concluded'}`}
                            {stage === 'error' && (error || "An error occurred.")}
                            {stage === 'user_turn' && "Your Turn (Speak now)"}
                            {stage === 'starting' && "Starting Interview..."}
                            {stage === 'requesting_perms' && "Requesting Permissions..."}
                            {stage === 'processing_user' && "Sending to Interviewer..."} {/* Stage after STT, before Gemini */}
                            {stage === 'idle' && (isOpen ? "Initializing..." : "Closed")}
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
                    // Allow closing unless AI is actively thinking/speaking or STT is processing
                    disabled={stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying) || stage === 'processing_stt_audio'}
                    title={
                        (stage === 'ai_thinking' || (stage === 'ai_speaking' && isGoogleTtsPlaying) || stage === 'processing_stt_audio')
                        ? "Please wait..."
                        : (stage === 'finished' ? 'Close' : 'Leave Interview')
                    }
                >
                    {stage === 'finished' || stage === 'error' || stage === 'idle' ? 'Close' : 'Leave Interview'}
                </button>
            </div>
        </div>
    );
}

export default InterviewMode;