// src/ClearConfirmGame.tsx - FINAL v8 - Corrected 2-Step Logic

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css'; // Make sure this CSS file exists and is styled

// --- Component Props ---
interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

// --- Game Constants ---
const TARGET_ZONE_WIDTH_DEGREES = 20;
const DEGREES_PER_SEC = 200; // Speed
const INDICATOR_OFFSET_DEGREES = -90;
const REQUIRED_SUCCESSES = 1; // Need 2 successes
const SUCCESS_DELAY_MS = 1500; // Delay after final success
const NEXT_ROUND_DELAY_MS = 1200; // Delay between successful rounds
const FAIL_DELAY_MS = 1500; // Delay after failure message

// --- Helper Function ---
function isAngleInZone(angle: number, start: number, end: number): boolean { const normalizedAngle = (angle - start + 360) % 360; const normalizedEnd = (end - start + 360) % 360; return normalizedAngle <= normalizedEnd; }

// --- The Component ---
const ClearConfirmGame: React.FC<ClearConfirmGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [currentAngle, setCurrentAngle] = useState(0);
    const [targetZone, setTargetZone] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');
    const [successCount, setSuccessCount] = useState(0); // State for 2-step confirm

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC);
    const isMountedRef = useRef<boolean>(false);
    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // --- Animation Loop --- (Stable)
    const animate = useCallback((timestamp: number) => {
        if (!isMountedRef.current) { lastTimestampRef.current = null; return; } // Check mount status
        if (!lastTimestampRef.current) { lastTimestampRef.current = timestamp; animationFrameRef.current = requestAnimationFrame(animate); return; }
        const deltaTime = (timestamp - lastTimestampRef.current) / 1000; lastTimestampRef.current = timestamp; const safeDeltaTime = Math.min(deltaTime, 0.1);
        if (safeDeltaTime <= 0) { animationFrameRef.current = requestAnimationFrame(animate); return; }
        const deltaAngle = speedRef.current * safeDeltaTime;
        setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360);
        animationFrameRef.current = requestAnimationFrame(animate);
    }, []); // Stable: No dependencies

    // --- Cleanup function --- (Stable)
    const cleanupAnimation = useCallback(() => {
        console.log("cleanupAnimation: Cancelling frame.");
        if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
        lastTimestampRef.current = null; setIsMoving(false);
    }, []);

    // --- Clear Game Timeouts Function --- (Stable)
    const clearGameTimeouts = useCallback(() => { console.log(`Clearing ${gameTimeoutsRef.current.length} game timeouts.`); gameTimeoutsRef.current.forEach(clearTimeout); gameTimeoutsRef.current = []; }, []);

    // --- Game Setup / Round Start ---
    // Takes current success count to display message correctly
    // Wrapped in useCallback, depends only on stable cleanupAnimation
    const setupRound = useCallback((currentRoundSuccessCount: number) => {
        if (!isMountedRef.current) return;
        console.log(`setupRound: Starting round for success ${currentRoundSuccessCount + 1}.`);
        cleanupAnimation(); // Ensure previous animation is stopped
        setMessage(`Press STOP in the Green Zone! (${currentRoundSuccessCount}/${REQUIRED_SUCCESSES})`);
        setStatus('playing');
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360); // Random start angle for indicator too
        // Small delay before starting movement to allow state to settle
        const startMovingTimer = setTimeout(() => {
             if (isMountedRef.current) {
                setIsMoving(true); // Trigger animation useEffect
                console.log(`setupRound: Setup complete. Target: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°. isMoving: true.`);
             }
        }, 50); // Short delay
        gameTimeoutsRef.current.push(startMovingTimer);

    }, [cleanupAnimation]); // Stable dependency

    // --- Effect to Start/Stop Animation Loop based on isMoving --- (Stable)
    useEffect(() => {
        if (isMoving) { if (!animationFrameRef.current) { console.log("useEffect[isMoving=true]: Starting animation loop."); lastTimestampRef.current = null; animationFrameRef.current = requestAnimationFrame(animate); } }
        else { cleanupAnimation(); } // Cleanup if isMoving becomes false
        return () => { if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } }; // Cleanup on unmount/dep change
    }, [isMoving, animate, cleanupAnimation]);

    // --- Effect to Setup/Cleanup Game on Open/Close --- (Stable)
    useEffect(() => {
        clearGameTimeouts();
        if (isOpen) {
            isMountedRef.current = true; console.log("useEffect[isOpen=true]: Component is visible. Initial setup.");
            setSuccessCount(0); // Reset count on open
            setupRound(0); // Initial setup, pass 0 successes
            return () => { console.log("useEffect[cleanup for isOpen=true]: Cleaning up."); isMountedRef.current = false; cleanupAnimation(); clearGameTimeouts(); setMessage(null); setStatus('playing'); setSuccessCount(0); };
        } else { isMountedRef.current = false; }
    }, [isOpen, setupRound, cleanupAnimation, clearGameTimeouts]); // Depends only on stable callbacks and isOpen


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return;
        console.log("handleStop: Stopping animation.");
        setIsMoving(false); // Request stop (useEffect[isMoving] will call cleanupAnimation)
        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // Use functional update for successCount
            setSuccessCount(prevCount => {
                const newSuccessCount = prevCount + 1;
                console.log(`Success! Count: ${newSuccessCount}/${REQUIRED_SUCCESSES}`);
                if (newSuccessCount === REQUIRED_SUCCESSES) { // FINAL SUCCESS
                    setStatus('success'); setMessage(`Success! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Chat history will be cleared.`);
                    const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, SUCCESS_DELAY_MS);
                    gameTimeoutsRef.current.push(successTimer);
                } else { // Intermediate Success
                    setStatus('playing'); setMessage(`Nice! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Get ready for the next round...`);
                    const nextRoundTimer = setTimeout(() => { if (isMountedRef.current) setupRound(newSuccessCount); /* Start next round, pass NEW count */ }, NEXT_ROUND_DELAY_MS);
                    gameTimeoutsRef.current.push(nextRoundTimer);
                }
                return newSuccessCount; // Return the new count for the state update
            });
        } else { // FAILURE
            console.log("Failed! Game Over."); setStatus('failed'); setMessage(`Missed! (${successCount}/${REQUIRED_SUCCESSES}) Game Over. Please try again.`); // Show current count before fail
            const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
            gameTimeoutsRef.current.push(failTimer);
        }
    };

    // --- Generate Conic Gradient Style --- (Keep As Is)
    const getConicGradientStyle = () => { const { start, end } = targetZone; const redColor = 'var(--confirm-game-red, #dc3545)'; const greenColor = 'var(--confirm-game-green, #198754)'; if (start <= end) { return `conic-gradient(${redColor} 0deg ${start}deg, ${greenColor} ${start}deg ${end}deg, ${redColor} ${end}deg 360deg)`; } else { return `conic-gradient(${greenColor} 0deg ${end}deg, ${redColor} ${end}deg ${start}deg, ${greenColor} ${start}deg 360deg)`; } };

    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return ( <div className="clear-confirm-overlay" onClick={onClose}><div className="clear-confirm-modal" onClick={(e) => e.stopPropagation()}><h4>Confirm Clear Chat</h4><p className="progress-indicator"> Successes: {successCount} / {REQUIRED_SUCCESSES} </p><p className={`game-message ${status}`}>{message || ' '}</p><div className="timing-circle-container"><div className="timing-circle" style={{ background: getConicGradientStyle() }} ><div className="timing-indicator-arm" style={{ transform: `rotate(${currentAngle + INDICATOR_OFFSET_DEGREES}deg)` }} ><div className="timing-indicator-dot"></div></div></div></div><button onClick={handleStop} className="stop-button" disabled={!isMoving || status !== 'playing'} > STOP </button><button onClick={onClose} className="cancel-button" disabled={status === 'success' || status === 'failed'} > Cancel </button></div></div> );
};

export default ClearConfirmGame;