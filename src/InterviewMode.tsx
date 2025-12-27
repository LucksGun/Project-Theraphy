import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAudioPlayer } from './AudioPlayer';
import './InterviewMode.css';

// --- CONFIGURATION ---
// IMPORTANT: This must match your Cloudflare Worker URL
const WORKER_SOCKET_URL = 'wss://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Ensure these files exist in your /public/assets/ folder
const VIDEO_ASSETS = {
    idle: '/assets/idle.mp4',
    talking: '/assets/talking.mp4',
    thinking: '/assets/thinking.mp4',
};

interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
}

// Helper Type for OpenAI Realtime Events
type RealtimeEvent = 
    | { type: 'response.audio.delta'; delta: string }
    | { type: 'input_audio_buffer.speech_started' }
    | { type: 'response.done' }
    | { type: 'error'; error: any };

const InterviewMode: React.FC<InterviewModeProps> = ({ isOpen, onClose }) => {
    // UI State
    const [status, setStatus] = useState<'connecting' | 'idle' | 'listening' | 'speaking' | 'thinking'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    
    // References for heavy logic (Non-rendering)
    const socketRef = useRef<WebSocket | null>(null);
    const audioPlayerRef = useRef<RealtimeAudioPlayer | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    
    // References for DOM Elements
    const interviewerVideoRef = useRef<HTMLVideoElement>(null);
    const userCamRef = useRef<HTMLVideoElement>(null);

    // --- 1. SESSION INITIALIZATION ---
    useEffect(() => {
        if (!isOpen) return;

        // Initialize our custom Audio Player
        audioPlayerRef.current = new RealtimeAudioPlayer();

        // Connect to Cloudflare Worker -> OpenAI
        const ws = new WebSocket(WORKER_SOCKET_URL);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to AI Worker");
            setStatus('idle');
            // Initial Trigger: Tell the AI to start the interview
            sendEvent({
                type: "response.create",
                response: {
                    instructions: "You are a serious University Interviewer. Briefly introduce yourself and ask the first question."
                }
            });
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerEvent(data);
            } catch (e) {
                console.error("Failed to parse WebSocket message", e);
            }
        };

        ws.onclose = () => console.log("Disconnected from AI Worker");
        ws.onerror = (err) => console.error("WebSocket Error", err);

        // Start capturing User Audio
        startMicrophone();

        // Cleanup when component unmounts or closes
        return () => {
            cleanupSession();
        };
    }, [isOpen]);

    // --- 2. VIDEO LOOP CONTROLLER ---
    // Switches the background video based on the current 'status'
    useEffect(() => {
        if (!interviewerVideoRef.current) return;
        
        let targetVideo = VIDEO_ASSETS.idle;
        
        if (status === 'speaking') targetVideo = VIDEO_ASSETS.talking;
        if (status === 'thinking') targetVideo = VIDEO_ASSETS.thinking;
        // Default to idle for listening/idle states
        if (status === 'listening' || status === 'idle') targetVideo = VIDEO_ASSETS.idle;

        // Only switch URL if it's different to prevent flickering
        const currentSrc = interviewerVideoRef.current.getAttribute('src');
        if (currentSrc !== targetVideo) {
            interviewerVideoRef.current.src = targetVideo;
            interviewerVideoRef.current.play().catch(e => console.log("Video autoplay blocked", e));
        }
    }, [status]);

    // --- 3. MICROPHONE SETUP ---
    const startMicrophone = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            mediaStreamRef.current = stream;

            // Show user their own face (Mirror)
            if (userCamRef.current) {
                userCamRef.current.srcObject = stream;
            }

            // Set up Audio Processing
            // OpenAI expects PCM16 at 24kHz
            const audioContext = new AudioContext({ sampleRate: 24000 });
            audioContextRef.current = audioContext;
            
            const source = audioContext.createMediaStreamSource(stream);
            
            // NOTE: ScriptProcessor is deprecated but easiest for raw PCM access in React without extra files.
            // Buffer size 4096 gives a good balance of latency vs performance.
            const processor = audioContext.createScriptProcessor(4096, 1, 1); 
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (socketRef.current?.readyState !== WebSocket.OPEN || isMuted) return;

                const inputData = e.inputBuffer.getChannelData(0);
                
                // Convert Float32 (Browser default) to Int16 (OpenAI Requirement)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    // Scale to 16-bit integer range
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Convert to Base64 string
                // We use a safe conversion method for large arrays
                let binary = '';
                const bytes = new Uint8Array(int16Data.buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Audio = window.btoa(binary);

                // Stream audio to Backend
                sendEvent({
                    type: "input_audio_buffer.append",
                    audio: base64Audio
                });
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (err) {
            console.error("Microphone setup failed", err);
            alert("Could not access microphone/camera. Please check permissions.");
        }
    };

    // --- 4. EVENT HANDLER ---
    const handleServerEvent = (data: RealtimeEvent) => {
        switch (data.type) {
            case 'response.audio.delta':
                // Streaming audio from AI
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.playChunk(data.delta);
                }
                setStatus('speaking');
                break;
            
            case 'input_audio_buffer.speech_started':
                // AI detects user started speaking -> Interrupt AI
                console.log("User started speaking (Interruption detected)");
                if (audioPlayerRef.current) audioPlayerRef.current.clear();
                sendEvent({ type: "input_audio_buffer.clear" }); // Clear AI's internal buffer
                setStatus('listening');
                break;

            case 'response.done':
                // AI finished its sentence
                setStatus('listening'); 
                break;
                
            case 'error':
                console.error("AI Error:", data.error);
                break;
        }
    };

    // Helper to send JSON to WebSocket
    const sendEvent = (event: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(event));
        }
    };

    // Clean up all resources
    const cleanupSession = () => {
        socketRef.current?.close();
        
        // Stop Camera/Mic
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        
        // Stop Audio Processing
        audioContextRef.current?.close();
        processorRef.current?.disconnect();
        
        // Stop Audio Player
        audioPlayerRef.current?.clear();
    };

    if (!isOpen) return null;

    return (
        <div className="interview-container">
            
            {/* BACKGROUND LAYER: The Interviewer Video */}
            <div className="video-background">
                <video 
                    ref={interviewerVideoRef} 
                    muted 
                    loop 
                    playsInline 
                    autoPlay 
                    src={VIDEO_ASSETS.idle}
                />
                <div className="vignette-overlay"></div>
            </div>

            {/* UI LAYER: Controls & Self-View */}
            <div className="ui-layer">
                
                {/* User Camera (Top Right) */}
                <div className="user-cam-pip">
                    <video ref={userCamRef} autoPlay muted playsInline />
                </div>

                {/* Status Indicator (Center Bottom) */}
                <div className={`status-pill status-${status === 'speaking' ? 'speaking' : status === 'listening' ? 'active' : 'idle'}`}>
                    <div className="status-dot"></div>
                    <span>
                        {status === 'speaking' ? 'Interviewer Speaking' : 
                         status === 'listening' ? 'Listening...' : 
                         status === 'connecting' ? 'Connecting...' : 'Thinking'}
                    </span>
                </div>

                {/* Control Bar (Bottom) */}
                <div className="control-bar">
                    <button 
                        className={`control-btn btn-mic ${isMuted ? 'muted' : ''}`}
                        onClick={() => setIsMuted(!isMuted)}
                        title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                        {isMuted ? '🔇' : '🎙️'}
                    </button>
                    <button 
                        className="control-btn btn-exit" 
                        onClick={onClose}
                        title="End Interview"
                    >
                        ❌
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InterviewMode;