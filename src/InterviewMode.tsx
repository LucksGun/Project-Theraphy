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

// --- TYPES FOR EXPORT (Fixes InterviewReport.tsx errors) ---
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
    | { type: 'response.done' }
    | { type: 'error'; error: any };

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

    useEffect(() => {
        if (!isOpen) return;

        audioPlayerRef.current = new RealtimeAudioPlayer();
        const ws = new WebSocket(WORKER_SOCKET_URL);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to AI Worker");
            setStatus('idle');
            sendEvent({
                type: "response.create",
                response: {
                    instructions: "You are a serious University Interviewer. Briefly introduce yourself."
                }
            });
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            mediaStreamRef.current = stream;
            if (userCamRef.current) userCamRef.current.srcObject = stream;

            const audioContext = new AudioContext({ sampleRate: 24000 });
            audioContextRef.current = audioContext;
            
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1); 
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (socketRef.current?.readyState !== WebSocket.OPEN || isMuted) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                let binary = '';
                const bytes = new Uint8Array(int16Data.buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                sendEvent({ type: "input_audio_buffer.append", audio: window.btoa(binary) });
            };

            source.connect(processor);
            processor.connect(audioContext.destination);
        } catch (err) {
            console.error("Mic Error", err);
        }
    };

    const handleServerEvent = (data: RealtimeEvent) => {
        switch (data.type) {
            case 'response.audio.delta':
                audioPlayerRef.current?.playChunk(data.delta);
                setStatus('speaking');
                break;
            case 'input_audio_buffer.speech_started':
                audioPlayerRef.current?.clear();
                sendEvent({ type: "input_audio_buffer.clear" });
                setStatus('listening');
                break;
            case 'response.done':
                setStatus('listening'); 
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
                    <button className={`control-btn btn-mic ${isMuted ? 'muted' : ''}`} onClick={() => setIsMuted(!isMuted)}>
                        {isMuted ? '🔇' : '🎙️'}
                    </button>
                    <button className="control-btn btn-exit" onClick={onClose}>❌</button>
                </div>
            </div>
        </div>
    );
};

export default InterviewMode;