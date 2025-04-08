// src/ThemePlinkoGame.tsx

import React, { useState, useEffect, useCallback } from 'react';
import './ThemePlinkoGame.css'; // We'll create this CSS file next
import { AppTheme } from './App'; // Import type from App

interface ThemePlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: AppTheme;
    // Accepts the function to *actually* change the theme
    onThemeChange: (newTheme: AppTheme) => void;
}

// Define possible animation outcomes
type AnimationOutcome = 'light' | 'dark';
const ANIMATION_NAMES: { [key: string]: AnimationOutcome } = {
    'plinko-drop-light-1': 'light',
    'plinko-drop-light-2': 'light',
    'plinko-drop-dark-1': 'dark',
    'plinko-drop-dark-2': 'dark',
    // Add more pairs if you create more animations in CSS
};
const ANIMATION_KEYS = Object.keys(ANIMATION_NAMES);

const ThemePlinkoGame: React.FC<ThemePlinkoGameProps> = ({
    isOpen, onClose, currentTheme, onThemeChange
}) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [result, setResult] = useState<AnimationOutcome | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    // State to hold the randomly chosen animation name for this run
    const [currentAnimationName, setCurrentAnimationName] = useState<string>('');

    const startGame = useCallback(() => {
        console.log("Starting Plinko Game");
        // Reset state
        setResult(null);
        setMessage("Dropping ball...");
        setIsAnimating(false); // Ensure animation restarts cleanly

        // Choose a random animation path/outcome
        const randomIndex = Math.floor(Math.random() * ANIMATION_KEYS.length);
        const randomAnimation = ANIMATION_KEYS[randomIndex];
        console.log("Chosen Animation:", randomAnimation);
        setCurrentAnimationName(randomAnimation);

        // Slight delay before setting isAnimating to true to allow state update
        // and ensure CSS animation restarts if the same one is picked twice
        setTimeout(() => {
             setIsAnimating(true);
        }, 50);

    }, []); // No dependencies needed for random choice

    // Start game when modal opens
    useEffect(() => {
        if (isOpen) {
            startGame();
        } else {
            // Reset when closing
            setIsAnimating(false);
            setResult(null);
            setMessage(null);
            setCurrentAnimationName('');
        }
    }, [isOpen, startGame]);

    // Handle animation end
    const handleAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
        // Check if the animation that ended is one of our plinko paths
        const animationName = event.animationName;
        if (ANIMATION_NAMES[animationName]) {
            console.log("Animation ended:", animationName);
            setIsAnimating(false); // Stop animation state
            const outcome = ANIMATION_NAMES[animationName];
            setResult(outcome);

            // Determine if theme should change
            if (currentTheme === outcome) {
                setMessage(`Ball landed on ${outcome}! Theme stays ${currentTheme}.`);
            } else {
                setMessage(`Ball landed on ${outcome}! Switching theme to ${outcome}.`);
                onThemeChange(outcome); // Call the function passed from App.tsx
            }

            // Close modal after a delay
            setTimeout(onClose, 2500); // Show result for 2.5 seconds
        }
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="plinko-game-overlay" onClick={onClose}>
            <div className="plinko-game-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Theme Plinko!</h4>

                <div className="plinko-board">
                    {/* Background image/structure */}
                    <div className={`plinko-ball ${isAnimating ? 'dropping' : ''}`}
                         style={{ animationName: isAnimating ? currentAnimationName : 'none' }}
                         onAnimationEnd={handleAnimationEnd} // Listen for animation end
                    ></div> {/* The Ball */}
                    <div className="plinko-label-light">LIGHT</div>
                    <div className="plinko-label-dark">DARK</div>
                </div>

                <p className="plinko-message" aria-live="polite">
                    {message || ' '}
                </p>

                {/* Optionally add a cancel button if animation is long */}
                 {!isAnimating && result === null && (
                    <button onClick={startGame} className="plinko-button">Drop Again</button>
                 )}
                 <button onClick={onClose} className="plinko-button cancel">Close</button>

            </div>
        </div>
    );
};

export default ThemePlinkoGame;