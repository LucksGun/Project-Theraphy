// src/ClearConfirmGame.tsx - Updated with Rotating Circle Logic

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css'; // Styles for the circle game

interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

// Game Constants
const TARGET_ZONE_WIDTH_DEGREES = 30; // How wide the green target zone is (e.g., 30 degrees)
const DEGREES_PER_SEC = 180; // Speed of rotation (degrees per second) - Increased from before
const INDICATOR_OFFSET_DEGREES = -90; // Offset indicator start (e.g., -90 makes 0 degrees at the top)

// Helper to check if angle is within the target zone (handles wrap-around)
function isAngleInZone(angle: number, start: number, end: number): boolean {
    const normalizedAngle = (angle - start + 360) % 360;
    const normalizedEnd = (end - start + 360) % 360;
    return normalizedAngle <= normalizedEnd;
}

const ClearConfirmGame: React.FC<ClearConfirmGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [currentAngle, setCurrentAngle] = useState(0); // 0 to 360 degrees
    const [targetZone, setTargetZone] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC); // Use ref for speed

    // Animation Loop using requestAnimationFrame
    const animate = useCallback((timestamp: number) => {
        if (!isMoving || !lastTimestampRef.current) {
            lastTimestampRef.current = timestamp; // Initialize timestamp
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000; // Seconds elapsed
        lastTimestampRef.current = timestamp;

        // Update angle using functional update to get latest value
        setCurrentAngle(prevAngle => (prevAngle + speedRef.current * deltaTime) % 360);

        // Continue animation only if still moving
        if(isMoving) {
             animationFrameRef.current = requestAnimationFrame(animate);
        }
    }, [isMoving]); // Depend on isMoving

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        setMessage("Press STOP in the Green Zone!");
        setStatus('playing');

        // Calculate random target zone
        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        console.log(`Target Zone: ${randomStartAngle.toFixed(1)}° to ${endAngle.toFixed(1)}°`);

        // Set random starting angle for the indicator
        setCurrentAngle(Math.random() * 360);

        // Start animation
        setIsMoving(true);
    }, []); // No dependencies needed if it only runs once on open

    // Effect to start/stop animation and setup game
    useEffect(() => {
        if (isOpen) {
            setupGame(); // Setup game when modal opens
        } else {
             setIsMoving(false); // Stop animation if closed externally
        }

        // Cleanup animation frame on unmount or when isOpen becomes false
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setIsMoving(false); // Ensure stopped state
        };
    }, [isOpen, setupGame]); // Depend on isOpen and setupGame


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return;
        setIsMoving(false); // Stop the animation

        const stoppedAngle = currentAngle; // Capture angle at time of click

        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // SUCCESS
            console.log("Success!");
            setStatus('success');
            setMessage('Success! Chat history will be cleared.');
            setTimeout(() => {
                onConfirm(); // Call the actual clear chat function
                onClose();   // Close the modal
            }, 1500);
        } else {
            // FAILURE
            console.log("Failed!");
            setStatus('failed');
            setMessage('Missed! Please try again.');
            setTimeout(() => {
                onClose(); // Close modal, user must reopen manually
            }, 1500);
        }
    };

    // --- Generate Conic Gradient Style ---
    // Handles wrap-around case for the gradient
    const getConicGradientStyle = () => {
        const { start, end } = targetZone;
        const redColor = 'var(--confirm-game-red, #dc3545)'; // Fallback colors
        const greenColor = 'var(--confirm-game-green, #198754)';

        if (start <= end) {
            // Normal case
            return `conic-gradient(
                ${redColor} 0deg ${start}deg,
                ${greenColor} ${start}deg ${end}deg,
                ${redColor} ${end}deg 360deg
            )`;
        } else {
            // Wrap-around case (e.g., start=350, end=20)
            return `conic-gradient(
                ${greenColor} 0deg ${end}deg,
                ${redColor} ${end}deg ${start}deg,
                ${greenColor} ${start}deg 360deg
            )`;
        }
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="clear-confirm-overlay" onClick={onClose}>
            <div className="clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                <p className={`game-message ${status}`}>{message || ' '}</p>

                <div className="timing-circle-container">
                    <div
                        className="timing-circle"
                        style={{ background: getConicGradientStyle() }} // Apply dynamic gradient
                    >
                        <div
                            className="timing-indicator-arm"
                            style={{ transform: `rotate(${currentAngle + INDICATOR_OFFSET_DEGREES}deg)` }}
                        >
                            <div className="timing-indicator-dot"></div> {/* The rotating dot */}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleStop}
                    className="stop-button"
                    disabled={!isMoving || status !== 'playing'}
                >
                    STOP
                </button>
                 <button
                    onClick={onClose}
                    className="cancel-button"
                    disabled={status === 'success' || status === 'failed'}
                 >
                     Cancel
                 </button>
            </div>
        </div>
    );
};

export default ClearConfirmGame;