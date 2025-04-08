// src/ClearConfirmGame.tsx - Requires 2 Successful Stops

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css';

interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

// Game Constants
const TARGET_ZONE_WIDTH_DEGREES = 30;
const DEGREES_PER_SEC = 180; // Speed
const INDICATOR_OFFSET_DEGREES = -90;
const REQUIRED_SUCCESSES = 2; // <<-- Need 2 successes
const SUCCESS_DELAY_MS = 1500; // Delay after final success
const NEXT_ROUND_DELAY_MS = 1000; // Shorter delay between rounds
const FAIL_DELAY_MS = 1500; // Delay after failure message

// Helper Function (Keep As Is)
function isAngleInZone(angle: number, start: number, end: number): boolean { /* ... */ const normalizedAngle = (angle - start + 360) % 360; const normalizedEnd = (end - start + 360) % 360; return normalizedAngle <= normalizedEnd; }

// The Component
const ClearConfirmGame: React.FC<ClearConfirmGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [currentAngle, setCurrentAngle] = useState(0);
    const [targetZone, setTargetZone] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');
    // *** NEW STATE: Track success count ***
    const [successCount, setSuccessCount] = useState(0);

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC);
    const isMountedRef = useRef<boolean>(false);
    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]); // Ref to store all timeouts

    // --- Cleanup timeouts ---
    const clearGameTimeouts = useCallback(() => {
        console.log(`Clearing ${gameTimeoutsRef.current.length} game timeouts.`);
        gameTimeoutsRef.current.forEach(clearTimeout);
        gameTimeoutsRef.current = [];
    }, []);

    // --- Animation Loop --- (Keep As Is)
    const animate = useCallback((timestamp: number) => { /* ... (same as previous version) ... */ if (!isMountedRef.current || !isMoving) { lastTimestampRef.current = null; if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; return; } if (!lastTimestampRef.current) { lastTimestampRef.current = timestamp; animationFrameRef.current = requestAnimationFrame(animate); return; } const deltaTime = (timestamp - lastTimestampRef.current) / 1000; lastTimestampRef.current = timestamp; const safeDeltaTime = Math.min(deltaTime, 0.1); const deltaAngle = speedRef.current * safeDeltaTime; setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360); animationFrameRef.current = requestAnimationFrame(animate); }, [isMoving]);

    // --- Cleanup Animation --- (Keep As Is)
    const cleanupAnimation = useCallback(() => { console.log("cleanupAnimation: Cancelling frame."); if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } lastTimestampRef.current = null; setIsMoving(false); }, []);

    // --- Game Setup / Round Start ---
    const setupRound = useCallback(() => {
        if (!isMountedRef.current) return;
        console.log(`setupRound: Starting round ${successCount + 1}.`);
        cleanupAnimation(); // Ensure previous animation is stopped
        setMessage(`Press STOP in the Green Zone! (${successCount}/${REQUIRED_SUCCESSES})`);
        setStatus('playing');
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360);
        setIsMoving(true); // Start animation
        console.log(`setupRound: Setup complete. Target: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°. isMoving: true.`);
    }, [cleanupAnimation, successCount]); // Depends on successCount for message

    // --- Effect to Setup/Cleanup Game on Open/Close ---
    useEffect(() => {
        if (isOpen) {
            isMountedRef.current = true;
            console.log("useEffect[isOpen=true]: Component is visible. Resetting and setting up game.");
            setSuccessCount(0); // Reset count when opening
            setupRound(); // Start the first round
            return () => { // Cleanup on close/unmount
                console.log("useEffect[cleanup for isOpen=true]: Cleaning up.");
                isMountedRef.current = false;
                cleanupAnimation();
                clearGameTimeouts(); // Clear any pending success/fail timeouts
                setMessage(null); setStatus('playing'); setSuccessCount(0);
            };
        } else {
            isMountedRef.current = false;
        }
    }, [isOpen, setupRound, cleanupAnimation]); // Depend on isOpen and stable callbacks


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return;
        setIsMoving(false); // Stop the animation FIRST
        cleanupAnimation(); // Cancel the animation frame explicitly

        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // SUCCESS on this round
            const newSuccessCount = successCount + 1;
            setSuccessCount(newSuccessCount);
            console.log(`Success! Count: ${newSuccessCount}/${REQUIRED_SUCCESSES}`);

            if (newSuccessCount === REQUIRED_SUCCESSES) {
                // FINAL SUCCESS
                setStatus('success');
                setMessage(`Success! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Chat history will be cleared.`);
                const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, SUCCESS_DELAY_MS);
                gameTimeoutsRef.current.push(successTimer);
            } else {
                // Intermediate Success - Start next round
                setStatus('playing'); // Keep status as playing technically
                setMessage(`Nice! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Get ready for the next round...`);
                const nextRoundTimer = setTimeout(() => { if (isMountedRef.current) setupRound(); }, NEXT_ROUND_DELAY_MS);
                gameTimeoutsRef.current.push(nextRoundTimer);
            }
        } else {
            // FAILURE - Game Over
            console.log("Failed! Game Over.");
            setStatus('failed');
            setMessage(`Missed! (${successCount}/${REQUIRED_SUCCESSES}) Game Over. Please try again.`);
            const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
            gameTimeoutsRef.current.push(failTimer);
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

                {/* Progress Indicator */}
                <p className="progress-indicator">
                    Successes: {successCount} / {REQUIRED_SUCCESSES}
                </p>

                {/* Game Message */}
                <p className={`game-message ${status}`}>{message || ' '}</p>

                {/* Circle Game Area */}
                <div className="timing-circle-container">
                    <div className="timing-circle" style={{ background: getConicGradientStyle() }}>
                        <div className="timing-indicator-arm" style={{ transform: `rotate(${currentAngle + INDICATOR_OFFSET_DEGREES}deg)` }}>
                            <div className="timing-indicator-dot"></div>
                        </div>
                    </div>
                </div>

                {/* Buttons */}
                <button onClick={handleStop} className="stop-button" disabled={!isMoving || status !== 'playing'}> STOP </button>
                <button onClick={onClose} className="cancel-button" disabled={status === 'success' || status === 'failed'}> Cancel </button>
            </div>
        </div>
    );
};

export default ClearConfirmGame;