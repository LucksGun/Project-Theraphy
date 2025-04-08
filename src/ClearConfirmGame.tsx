// src/ClearConfirmGame.tsx - FINAL CORRECTED Version

import React, { useState, useEffect, useRef, useCallback } from 'react'; // Removed unused useMemo
import './ClearConfirmGame.css'; // Make sure this CSS file exists and is styled

// --- Component Props ---
interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void; // Function to call on successful stop
}

// --- Game Constants ---
const TARGET_ZONE_WIDTH_DEGREES = 30;
const DEGREES_PER_SEC = 180; // Speed of rotation (degrees per second)
const INDICATOR_OFFSET_DEGREES = -90; // Offset indicator start (e.g., -90 makes 0 degrees at the top)
const REQUIRED_SUCCESSES = 2; // Need 2 successes
const SUCCESS_DELAY_MS = 1500; // Delay after final success
const NEXT_ROUND_DELAY_MS = 1000; // Shorter delay between successful rounds
const FAIL_DELAY_MS = 1500; // Delay after failure message before closing (was RESTART_DELAY_MS)

// --- Helper Function ---
// Checks if angle is within the target zone (handles wrap-around)
function isAngleInZone(angle: number, start: number, end: number): boolean {
    const normalizedAngle = (angle - start + 360) % 360;
    const normalizedEnd = (end - start + 360) % 360;
    return normalizedAngle <= normalizedEnd;
}

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

    // --- Animation Loop ---
    const animate = useCallback((timestamp: number) => {
        if (!isMountedRef.current) { console.log(">>> animate STOP: Unmounted."); lastTimestampRef.current = null; return; }
        if (!lastTimestampRef.current) { console.log(`>>> animate: initializing lastTimestamp = ${timestamp.toFixed(0)}`); lastTimestampRef.current = timestamp; animationFrameRef.current = requestAnimationFrame(animate); return; }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;
        const safeDeltaTime = Math.min(deltaTime, 0.1);

        if (safeDeltaTime <= 0) { console.log(">>> animate: deltaTime zero or negative, requesting next frame."); animationFrameRef.current = requestAnimationFrame(animate); return; }

        const deltaAngle = speedRef.current * safeDeltaTime;
        let nextAngle = 0;
        setCurrentAngle(prevAngle => { nextAngle = (prevAngle + deltaAngle) % 360; /* console.log(`>>> animate UPDATE: dT=${safeDeltaTime.toFixed(4)}s | deltaAngle=${deltaAngle.toFixed(2)} | prevAngle=${prevAngle.toFixed(1)} | newAngle=${nextAngle.toFixed(1)}`); */ return nextAngle; }); // Log less frequently if needed

        console.log(">>> animate: Requesting next animation frame."); // Check if loop continues
        animationFrameRef.current = requestAnimationFrame(animate);
    }, []); // Empty deps, uses refs and state setters

    // --- Cleanup Animation Function ---
    const cleanupAnimation = useCallback(() => {
        console.log("cleanupAnimation: Cancelling frame.");
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        lastTimestampRef.current = null;
        setIsMoving(false); // Ensure stopped state
    }, []);

    // --- Clear Game Timeouts Function ---
     const clearGameTimeouts = useCallback(() => {
        console.log(`Clearing ${gameTimeoutsRef.current.length} game timeouts.`);
        gameTimeoutsRef.current.forEach(clearTimeout);
        gameTimeoutsRef.current = [];
    }, []);

    // --- Game Setup / Round Start ---
     const setupRound = useCallback((isInitialSetup = false) => {
        if (!isMountedRef.current) return;
        const currentSuccessCount = isInitialSetup ? 0 : successCount; // Read current count for message
        if (isInitialSetup) setSuccessCount(0); // Reset internal state only on initial setup

        console.log(`setupRound: Starting round ${currentSuccessCount + 1}.`);
        cleanupAnimation(); // Ensure previous animation is stopped
        setMessage(`Press STOP in the Green Zone! (${currentSuccessCount}/${REQUIRED_SUCCESSES})`);
        setStatus('playing');
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360);
        setIsMoving(true); // Trigger animation useEffect to start the loop
        console.log(`setupRound: Setup complete. Target: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°. isMoving: true.`);
    }, [cleanupAnimation, successCount]); // Dependency includes successCount for message update

    // --- Effect to Start/Stop Animation Loop based on isMoving ---
    useEffect(() => {
        if (isMoving) {
            if (!animationFrameRef.current) {
                console.log("useEffect[isMoving=true]: Starting animation loop.");
                lastTimestampRef.current = null; // Reset timestamp on start
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        } else {
            // cleanupAnimation is called by handleStop or the isOpen effect cleanup
        }
        // Cleanup just cancels frame if effect re-runs while moving (shouldn't happen often)
        return () => {
             if (animationFrameRef.current) {
                 cancelAnimationFrame(animationFrameRef.current);
                 animationFrameRef.current = null;
             }
        };
    }, [isMoving, animate, cleanupAnimation]);


    // --- Effect to Setup/Cleanup Game on Open/Close ---
    useEffect(() => {
        clearGameTimeouts(); // Clear any pending success/fail timeouts on open/close
        if (isOpen) {
            isMountedRef.current = true;
            console.log("useEffect[isOpen=true]: Component is visible. Initial setup.");
            setupRound(true); // Initial setup resets count
            // Return cleanup function for when modal closes or component unmounts
            return () => {
                console.log("useEffect[cleanup for isOpen=true]: Cleaning up on close/unmount.");
                isMountedRef.current = false;
                cleanupAnimation(); // Ensure animation stops
                clearGameTimeouts(); // Clear timeouts again just in case
                // Reset state fully on close/unmount
                setMessage(null);
                setStatus('playing');
                setSuccessCount(0); // Ensure count is reset
            };
        } else {
            isMountedRef.current = false; // Ensure flag is false if closed externally
        }
    // Depend only on isOpen and stable setupRound/cleanupAnimation callbacks
    }, [isOpen, setupRound, cleanupAnimation, clearGameTimeouts]);


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return; // Prevent multiple stops
        console.log("handleStop: Stopping animation.");
        setIsMoving(false); // Request stop (useEffect[isMoving] will call cleanupAnimation)

        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // SUCCESS on this round
            const newSuccessCount = successCount + 1;
            setSuccessCount(newSuccessCount); // Update count state
            console.log(`Success! Count: ${newSuccessCount}/${REQUIRED_SUCCESSES}`);

            if (newSuccessCount === REQUIRED_SUCCESSES) { // FINAL SUCCESS
                setStatus('success');
                setMessage(`Success! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Chat history will be cleared.`);
                const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, SUCCESS_DELAY_MS);
                gameTimeoutsRef.current.push(successTimer); // Track timeout
            } else { // Intermediate Success
                setStatus('playing'); // Keep status playing
                setMessage(`Nice! (${newSuccessCount}/${REQUIRED_SUCCESSES}) Get ready for the next round...`);
                const nextRoundTimer = setTimeout(() => { if (isMountedRef.current) setupRound(false); /* Start next round */ }, NEXT_ROUND_DELAY_MS);
                gameTimeoutsRef.current.push(nextRoundTimer); // Track timeout
            }
        } else { // FAILURE
            console.log("Failed! Game Over.");
            setStatus('failed');
            setMessage(`Missed! (${successCount}/${REQUIRED_SUCCESSES}) Game Over. Please try again.`);
            const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS); // Use correct constant
            gameTimeoutsRef.current.push(failTimer); // Track timeout
        }
    };

    // --- Generate Conic Gradient Style ---
    const getConicGradientStyle = () => { const { start, end } = targetZone; const redColor = 'var(--confirm-game-red, #dc3545)'; const greenColor = 'var(--confirm-game-green, #198754)'; if (start <= end) { return `conic-gradient(${redColor} 0deg ${start}deg, ${greenColor} ${start}deg ${end}deg, ${redColor} ${end}deg 360deg)`; } else { return `conic-gradient(${greenColor} 0deg ${end}deg, ${redColor} ${end}deg ${start}deg, ${greenColor} ${start}deg 360deg)`; } };

    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return (
        <div className="clear-confirm-overlay" onClick={onClose}>
            <div className="clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                <p className="progress-indicator"> Successes: {successCount} / {REQUIRED_SUCCESSES} </p>
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