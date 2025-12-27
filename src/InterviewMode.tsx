// src/InterviewMode.tsx
import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAudioPlayer } from './AudioPlayer';
import './InterviewMode.css';

// --- CONFIGURATION ---
const WORKER_SOCKET_URL = 'wss://project-theraphy-ai-proxy.luckgun99.workers.dev/';

const VIDEO_ASSETS = {
    idle: '/assets/idle.mp4',
    talking: '/assets/talking.mp4',
    thinking: '/assets/thinking.mp4',
};

// --- TYPES ---
export type InterviewResult = 'pass' | 'fail' | null;

export interface InterviewReportData {
    result: InterviewResult;
    summary: string;
    transcript: {
        id: number;
        text: string;
        sender: 'user' | 'bot' | 'loading';
        timestamp: number;
    }[];
}

interface InterviewModeProps {
    isOpen: boolean;
    onClose: () => void;
}

type RealtimeEvent =
    | { type: 'response.audio.delta'; delta: string }
    | { type: 'input_audio_buffer.speech_started' }
    | { type: 'input_audio_buffer.speech_stopped' }
    | { type: 'response.done' }
    | { type: 'error'; error: any };

// --- HELPER: Fast Base64 Encoding for Audio ---
const floatTo16BitPCM = (float32Array: Float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        // Little Endian (true) is required by OpenAI
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

const InterviewMode: React.FC<InterviewModeProps> = ({ isOpen, onClose }) => {
    const [status, setStatus] = useState<'connecting' | 'idle' | 'listening' | 'speaking' | 'thinking'>('connecting');
    const [isMuted, setIsMuted] = useState(false);

    const socketRef = useRef<WebSocket | null>(null);
    const audioPlayerRef = useRef<RealtimeAudioPlayer | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

    const interviewerVideoRef = useRef<HTMLVideoElement>(null);
    const userCamRef = useRef<HTMLVideoElement>(null);
    
    // Safety Gates
    const audioGateRef = useRef<boolean>(false); // Blocks initial startup pop
    const isProcessingRef = useRef<boolean>(false); // Blocks noise during "Thinking" phase

    useEffect(() => {
        if (!isOpen) return;

        // 1. LOCK DOWN AUDIO immediately
        audioGateRef.current = false;
        isProcessingRef.current = false;

        audioPlayerRef.current = new RealtimeAudioPlayer();
        const ws = new WebSocket(WORKER_SOCKET_URL);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to AI Worker");
            setStatus('idle');
            
            // 2. CRITICAL SEQUENCE: Clear Buffer -> Wait -> Greet -> Wait -> Unmute
            // This prevents the "0ms" crash seen in your logs.
            
            // Step A: Wipe any noise sent during connection
            sendEvent({ type: "input_audio_buffer.clear" });

            setTimeout(() => {
                // Step B: Ask AI to start (after buffer is definitely clear)
                sendEvent({
                    type: "response.create",
                    response: {
                        modalities: ["text", "audio"],
                        instructions: "You are a serious University Interviewer. Briefly introduce yourself and ask the first question."
                    }
                });

                // Step C: Finally open the microphone gate after AI has started processing
                setTimeout(() => {
                    console.log("Microphone Gate Open");
                    audioGateRef.current = true;
                }, 1000); 

            }, 500);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerEvent(data);
            } catch (e) {
                console.error("WebSocket Parse Error", e);
            }
        };

        ws.onclose = () => console.log("Disconnected from AI Worker");
        ws.onerror = (err) => console.error("WebSocket Error", err);

        startMicrophone();

        return () => cleanupSession();
    }, [isOpen]);

    useEffect(() => {
        if (!interviewerVideoRef.current) return;
        let targetVideo = VIDEO_ASSETS.idle;
        if (status === 'speaking') targetVideo = VIDEO_ASSETS.talking;
        if (status === 'thinking') targetVideo = VIDEO_ASSETS.thinking;

        const currentSrc = interviewerVideoRef.current.getAttribute('src');
        if (currentSrc !== targetVideo) {
            interviewerVideoRef.current.src = targetVideo;
            interviewerVideoRef.current.play().catch(e => console.log("Auto-play blocked", e));
        }
    }, [status]);

    const startMicrophone = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    echoCancellation: true, // MUST BE TRUE to prevent self-interruption
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: true 
            });
            
            mediaStreamRef.current = stream;
            if (userCamRef.current) userCamRef.current.srcObject = stream;

            const audioContext = new AudioContext({ sampleRate: 24000 });
            audioContextRef.current = audioContext;
            await audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                // Block audio if:
                // 1. Socket not open
                // 2. User is muted
                // 3. Initial startup gate is closed
                // 4. AI is currently "Thinking" (prevents accidental interruptions)
                if (
                    socketRef.current?.readyState !== WebSocket.OPEN || 
                    isMuted || 
                    !audioGateRef.current ||
                    isProcessingRef.current
                ) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16Buffer = floatTo16BitPCM(inputData);
                const base64Audio = arrayBufferToBase64(pcm16Buffer);
                sendEvent({ type: "input_audio_buffer.append", audio: base64Audio });
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (err) {
            console.error("Mic Error", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const handleServerEvent = (data: RealtimeEvent) => {
        switch (data.type) {
            case 'response.audio.delta':
                // AI is speaking
                isProcessingRef.current = false; // Allow user to interrupt now if they want
                audioPlayerRef.current?.playChunk(data.delta);
                setStatus('speaking');
                break;
                
            case 'input_audio_buffer.speech_started':
                // User started speaking -> Interrupt AI
                console.log("User speech started");
                audioPlayerRef.current?.clear(); // Stop AI audio instantly
                sendEvent({ type: "input_audio_buffer.clear" }); // Clear server buffer
                setStatus('listening');
                break;

            case 'input_audio_buffer.speech_stopped':
                // User finished speaking -> AI starts "Thinking"
                // Lock the mic briefly to prevent noise from cancelling the response
                isProcessingRef.current = true; 
                setStatus('thinking');
                break;

            case 'response.done':
                // AI Finished
                isProcessingRef.current = false;
                setStatus('idle');
                break;
                
            case 'error':
                console.error("AI Error:", data.error);
                isProcessingRef.current = false;
                setStatus('idle');
                break;
        }
    };

    const sendEvent = (event: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(event));
        }
    };

    const cleanupSession = () => {
        socketRef.current?.close();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        audioContextRef.current?.close();
        processorRef.current?.disconnect();
        audioPlayerRef.current?.clear();
    };

    if (!isOpen) return null;

    return (
        <div className="interview-container">
            <div className="video-background">
                <video ref={interviewerVideoRef} muted loop playsInline autoPlay src={VIDEO_ASSETS.idle} />
                <div className="vignette-overlay"></div>
            </div>
            <div className="ui-layer">
                <div className="user-cam-pip">
                    <video ref={userCamRef} autoPlay muted playsInline />
                </div>
                
                <div className={`status-pill status-${status}`}>
                    <div className="status-dot"></div>
                    <span>{status.toUpperCase()}</span>
                </div>

                <div className="control-bar">
                    <button 
                        className={`control-btn btn-mic ${isMuted ? 'muted' : ''}`} 
                        onClick={() => setIsMuted(!isMuted)}
                    >
                        {isMuted ? '🔇' : '🎙️'}
                    </button>
                    <button className="control-btn btn-exit" onClick={onClose}>❌</button>
                </div>
            </div>
        </div>
    );
};

export default InterviewMode;