// src/ClearConfirmGame.tsx - FINAL COMPLETE Version

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css'; // Make sure this CSS file exists and is styled

// --- Component Props ---
interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void; // Function to call on successful stop
}

// --- Game Constants ---
const TARGET_ZONE_WIDTH_DEGREES = 30; // How wide the green target zone is
const DEGREES_PER_SEC = 180; // Speed of rotation (degrees per second)
const INDICATOR_OFFSET_DEGREES = -90; // Offset indicator start (e.g., -90 makes 0 degrees at the top)
const SUCCESS_DELAY_MS = 1500; // Delay after success message before closing/confirming
const RESTART_DELAY_MS = 1500; // Delay after failure message before closing

// --- Helper Function ---
// Checks if angle is within the target zone (handles wrap-around)
function isAngleInZone(angle: number, start: number, end: number): boolean {
    // Normalize angle and end relative to the start
    const normalizedAngle = (angle - start + 360) % 360;
    const normalizedEnd = (end - start + 360) % 360;
    // Because the zone has a width, check if the normalized angle is within that width
    return normalizedAngle <= normalizedEnd;
}

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
    const isMountedRef = useRef<boolean>(false); // Use ref for mount status

    // --- Animation Loop ---
    const animate = useCallback((timestamp: number) => {
        if (!isMountedRef.current || !isMoving) {
            // Stop loop if unmounted or explicitly stopped
            lastTimestampRef.current = null;
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
            return;
        }

        if (!lastTimestampRef.current) {
            lastTimestampRef.current = timestamp; // Initialize timestamp
            animationFrameRef.current = requestAnimationFrame(animate); // Request next frame
            return;
        }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;
        const safeDeltaTime = Math.min(deltaTime, 0.1); // Cap delta time

        const deltaAngle = speedRef.current * safeDeltaTime;

        // Use functional update for setCurrentAngle
        setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360);

        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(animate);

    }, [isMoving]); // animate depends on isMoving

    // --- Cleanup function ---
    const cleanupAnimation = useCallback(() => {
        console.log("cleanupAnimation: Cancelling frame and resetting timestamp.");
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        lastTimestampRef.current = null;
        setIsMoving(false); // Ensure stopped state
    }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        console.log("setupGame: Starting setup.");
        cleanupAnimation(); // Clear previous animation first
        setMessage("Press STOP in the Green Zone!");
        setStatus('playing');
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360);
        setIsMoving(true); // This triggers the animation useEffect
        console.log(`setupGame: Setup complete. Target: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°. Start: ${currentAngle.toFixed(1)}°. isMoving: true.`);
    }, [cleanupAnimation, currentAngle]); // Exclude currentAngle if random start is desired

    // --- Effect to Start/Stop Animation based on isMoving ---
    useEffect(() => {
        if (isMoving) {
            if (!animationFrameRef.current) {
                console.log("useEffect[isMoving=true]: Starting animation loop.");
                lastTimestampRef.current = null;
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        } else {
             // Cleanup is handled by the effect below or handleStop
        }
        // Cleanup function for unmount or if isMoving/animate changes
        return () => {
             if (animationFrameRef.current) {
                 cancelAnimationFrame(animationFrameRef.current);
                 animationFrameRef.current = null;
             }
        };
    }, [isMoving, animate]);

    // --- Effect to Setup/Cleanup Game on Open/Close ---
    useEffect(() => {
        if (isOpen) {
            console.log("useEffect[isOpen=true]: Setting isMountedRef=true.");
            isMountedRef.current = true;
            setupGame(); // Setup game on open
            return () => { // Cleanup function runs ONLY when isOpen becomes false or unmount
                console.log("useEffect [cleanup for isOpen=true]: Cleaning up.");
                isMountedRef.current = false;
                cleanupAnimation();
                setMessage(null); setStatus('playing'); setTargetZone({ start: 0, end: 0 }); // Reset state
            };
        } else {
             isMountedRef.current = false; // Ensure flag is false if closed externally
        }
    }, [isOpen, setupGame, cleanupAnimation]); // Depend on stable callbacks


    // --- Handle Stop ---
    const handleStop = () => {
        if (!isMoving) return;
        setIsMoving(false); // Stop the animation FIRST
        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // SUCCESS
            console.log("Success!");
            setStatus('success');
            setMessage('Success! Chat history will be cleared.');
            setTimeout(() => {
                if (isMountedRef.current) { // Check if still mounted before calling callbacks
                    onConfirm();
                    onClose();
                }
            }, SUCCESS_DELAY_MS); // Use separate constant for success delay
        } else {
            // FAILURE
            console.log("Failed!");
            setStatus('failed');
            setMessage('Missed! Please try again.');
            setTimeout(() => {
                 if (isMountedRef.current) onClose(); // Close modal after delay
            }, RESTART_DELAY_MS); // *** CORRECTED CONSTANT HERE ***
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