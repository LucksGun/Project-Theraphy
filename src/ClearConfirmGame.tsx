// src/ClearConfirmGame.tsx - FINAL v6 - Simplified Animation Control

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css'; // Make sure this CSS file exists and is styled

// --- Component Props ---
interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

// --- Game Constants ---
const TARGET_ZONE_WIDTH_DEGREES = 30;
const DEGREES_PER_SEC = 180; // Speed
const INDICATOR_OFFSET_DEGREES = -90;
const SUCCESS_DELAY_MS = 1500;
const RESTART_DELAY_MS = 1500; // Delay after failure message before closing

// --- Helper Function ---
function isAngleInZone(angle: number, start: number, end: number): boolean { const normalizedAngle = (angle - start + 360) % 360; const normalizedEnd = (end - start + 360) % 360; return normalizedAngle <= normalizedEnd; }

// --- The Component ---
const ClearConfirmGame: React.FC<ClearConfirmGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [currentAngle, setCurrentAngle] = useState(0);
    const [targetZone, setTargetZone] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC);
    const isMountedRef = useRef<boolean>(false);

    // --- Animation Loop ---
    // Wrap animate in useCallback, but it doesn't need isMoving as dependency anymore
    // as the loop continuation is checked internally and started/stopped externally.
    const animate = useCallback((timestamp: number) => {
        if (!isMountedRef.current) return; // Stop if unmounted

        if (!lastTimestampRef.current) {
            lastTimestampRef.current = timestamp;
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;
        const safeDeltaTime = Math.min(deltaTime, 0.1);
        const deltaAngle = speedRef.current * safeDeltaTime;

        setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360);

        // Request next frame implicitly assumes isMoving is true
        // If isMoving becomes false elsewhere, the check at the start of this function
        // isn't hit until the *next* frame request, so explicit cancel is needed.
        animationFrameRef.current = requestAnimationFrame(animate);

    }, []); // No dependencies needed now

    // --- Cleanup function ---
    const cleanupAnimation = useCallback(() => {
        console.log("cleanupAnimation: Cancelling frame.");
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        lastTimestampRef.current = null;
        // We don't necessarily set isMoving false here, could be called on unmount
    }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        console.log("setupGame: Starting setup.");
        cleanupAnimation(); // Clear previous just in case
        setMessage("Press STOP in the Green Zone!");
        setStatus('playing');
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360);

        // Start animation directly
        setIsMoving(true);
        lastTimestampRef.current = null; // Reset timestamp before starting loop
        animationFrameRef.current = requestAnimationFrame(animate);
        console.log(`setupGame: Setup complete. Target: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°. isMoving: true. Animation requested.`);

    }, [cleanupAnimation, animate]); // Depends on callbacks


    // --- Main Effect for Setup/Cleanup on Open/Close ---
    useEffect(() => {
        if (isOpen) {
            isMountedRef.current = true;
            console.log("useEffect[isOpen=true]: Component is visible. Setting up game.");
            setupGame(); // Setup game when modal opens

            // Return cleanup function for when modal closes or component unmounts
            return () => {
                console.log("useEffect[cleanup for isOpen=true]: Cleaning up.");
                isMountedRef.current = false;
                cleanupAnimation(); // Ensure animation stops
                // Reset other relevant state if needed when closing
                setMessage(null);
                setStatus('playing');
            };
        } else {
            isMountedRef.current = false; // Ensure flag is false if closed externally
        }
    }, [isOpen, setupGame, cleanupAnimation]); // Depend on isOpen and stable callbacks

    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return; // Prevent multiple clicks
        console.log("handleStop: Stopping animation.");
        setIsMoving(false); // Set state first
        cleanupAnimation(); // Explicitly cancel animation frame

        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            console.log("Success!");
            setStatus('success');
            setMessage('Success! Chat history will be cleared.');
            setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, SUCCESS_DELAY_MS);
        } else {
            console.log("Failed!");
            setStatus('failed');
            setMessage('Missed! Please try again.');
            setTimeout(() => { if (isMountedRef.current) onClose(); }, RESTART_DELAY_MS);
        }
    };

    // --- Generate Conic Gradient Style --- (Keep As Is)
    const getConicGradientStyle = () => { /* ... */ const { start, end } = targetZone; const redColor = 'var(--confirm-game-red, #dc3545)'; const greenColor = 'var(--confirm-game-green, #198754)'; if (start <= end) { return `conic-gradient(${redColor} 0deg ${start}deg, ${greenColor} ${start}deg ${end}deg, ${redColor} ${end}deg 360deg)`; } else { return `conic-gradient(${greenColor} 0deg ${end}deg, ${redColor} ${end}deg ${start}deg, ${greenColor} ${start}deg 360deg)`; } };

    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return (
        <div className="clear-confirm-overlay" onClick={onClose}>
            <div className="clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                <p className={`game-message ${status}`}>{message || ' '}</p>
                <div className="timing-circle-container">
                    <div className="timing-circle" style={{ background: getConicGradientStyle() }} >
                        <div className="timing-indicator-arm" style={{ transform: `rotate(${currentAngle + INDICATOR_OFFSET_DEGREES}deg)` }} >
                            <div className="timing-indicator-dot"></div>
                        </div>
                    </div>
                </div>
                <button onClick={handleStop} className="stop-button" disabled={!isMoving || status !== 'playing'} > STOP </button>
                <button onClick={onClose} className="cancel-button" disabled={status === 'success' || status === 'failed'} > Cancel </button>
            </div>
        </div>
    );
};

export default ClearConfirmGame;