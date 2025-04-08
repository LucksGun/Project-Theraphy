// src/ClearConfirmGame.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ClearConfirmGame.css'; // We'll create this CSS file next

interface ClearConfirmGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void; // Function to call on successful stop
}

// Game Constants
const BAR_WIDTH_PERCENT = 100; // Use percentage for flexibility
const INDICATOR_WIDTH_PERCENT = 2; // Width of the sliding arrow/indicator
const GREEN_ZONE_START_PERCENT = 45; // Start of green zone (e.g., 45%)
const GREEN_ZONE_WIDTH_PERCENT = 10; // Width of green zone (e.g., 10%)
const GREEN_ZONE_END_PERCENT = GREEN_ZONE_START_PERCENT + GREEN_ZONE_WIDTH_PERCENT;
const INITIAL_SPEED_PERCENT_PER_SEC = 50; // Speed (e.g., 50% of bar width per second)
// Optional: Increase speed over time? (Add state and logic if needed)

const ClearConfirmGame: React.FC<ClearConfirmGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [positionPercent, setPositionPercent] = useState(0); // 0 to 100
    const [direction, setDirection] = useState(1); // 1 for right, -1 for left
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(INITIAL_SPEED_PERCENT_PER_SEC); // Use ref for speed within animation loop

    const animate = useCallback((timestamp: number) => {
        if (!lastTimestampRef.current) {
            lastTimestampRef.current = timestamp;
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000; // Seconds elapsed
        lastTimestampRef.current = timestamp;

        setPositionPercent(prevPosition => {
            let newPosition = prevPosition + direction * speedRef.current * deltaTime;
            let newDirection = direction;

            // Bounce logic
            if (newPosition >= BAR_WIDTH_PERCENT - INDICATOR_WIDTH_PERCENT) {
                newPosition = BAR_WIDTH_PERCENT - INDICATOR_WIDTH_PERCENT;
                newDirection = -1;
            } else if (newPosition <= 0) {
                newPosition = 0;
                newDirection = 1;
            }

            // Only update direction state if it actually changes
            if (newDirection !== direction) {
                setDirection(newDirection);
            }
            return newPosition;
        });

        animationFrameRef.current = requestAnimationFrame(animate);
    }, [direction]); // Dependency: direction (to use current value in bounce logic)

    // Start/Stop animation based on isMoving state
    useEffect(() => {
        if (isMoving) {
            console.log("Starting animation");
            lastTimestampRef.current = null; // Reset timestamp for delta calculation
            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            console.log("Stopping animation");
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        }
        // Cleanup function
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isMoving, animate]);

    // Effect to start game when modal opens
    useEffect(() => {
        if (isOpen) {
            setPositionPercent(Math.random() * (BAR_WIDTH_PERCENT - INDICATOR_WIDTH_PERCENT)); // Start at random position
            setDirection(Math.random() > 0.5 ? 1 : -1); // Random start direction
            setMessage("Press STOP in the Green Zone!");
            setStatus('playing');
            setIsMoving(true); // Start animation
        } else {
            setIsMoving(false); // Ensure animation stops if closed externally
        }
    }, [isOpen]);

    const handleStop = () => {
        if (!isMoving) return; // Prevent multiple clicks
        setIsMoving(false); // Stop the animation

        const currentPosition = positionPercent; // Capture position at time of click
        const indicatorCenter = currentPosition + INDICATOR_WIDTH_PERCENT / 2;

        console.log(`Stopped at: ${indicatorCenter.toFixed(1)}%`);

        if (indicatorCenter >= GREEN_ZONE_START_PERCENT && indicatorCenter <= GREEN_ZONE_END_PERCENT) {
            // SUCCESS
            console.log("Success!");
            setStatus('success');
            setMessage('Success! Chat history will be cleared.');
            setTimeout(() => {
                onConfirm(); // Call the actual clear chat function
                onClose();   // Close the modal
            }, 1500); // Delay to show success message
        } else {
            // FAILURE
            console.log("Failed!");
            setStatus('failed');
            setMessage('Missed! Please try again.');
            setTimeout(() => {
                onClose(); // Close modal, user must reopen manually
            }, 1500); // Delay to show failure message
        }
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="clear-confirm-overlay" onClick={onClose}>
            <div className="clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                <p className={`game-message ${status}`}>{message}</p>

                <div className="timing-bar-container">
                    <div className="timing-bar">
                        <div className="timing-bar-green-zone"></div>
                        <div
                            className="timing-bar-indicator"
                            style={{ left: `${positionPercent}%` }}
                        >▲</div> {/* Indicator */}
                    </div>
                </div>

                <button
                    onClick={handleStop}
                    className="stop-button"
                    disabled={!isMoving || status !== 'playing'} // Disable after stopping
                >
                    STOP
                </button>
                 <button
                    onClick={onClose}
                    className="cancel-button"
                    disabled={status === 'success' || status === 'failed'} // Disable after game ends
                 >
                     Cancel
                 </button>
            </div>
        </div>
    );
};

export default ClearConfirmGame;