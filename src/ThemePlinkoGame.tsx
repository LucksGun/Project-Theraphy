// src/ThemePlinkoGame.tsx - Complete with CSS Pins

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ThemePlinkoGame.css'; // Import the CSS for styling
import { AppTheme } from './App'; // Import type from App

interface ThemePlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: AppTheme;
    // Accepts the function to *actually* change the theme
    onThemeChange: (newTheme: AppTheme) => void;
}

// Define possible animation outcomes based on animation names in CSS
type AnimationOutcome = 'light' | 'dark';
const ANIMATION_NAMES: { [key: string]: AnimationOutcome } = {
    'plinko-drop-light-1': 'light',
    'plinko-drop-light-2': 'light',
    'plinko-drop-dark-1': 'dark',
    'plinko-drop-dark-2': 'dark',
    'plinko-drop-dark-3': 'dark',
    'plinko-drop-light-3': 'light',
    // Add more pairs if you create more animations in CSS
};
const ANIMATION_KEYS = Object.keys(ANIMATION_NAMES);

// Define Pin Layout (Example - Adjust top/left percentages for your desired look)
// *** NEW Pin Layout Definition ***
const pinLayout = [
    // Row 1 (Top Center)
    { top: '20%', left: '50%' },
    // Row 2 (Offset from Row 1)
    { top: '32%', left: '40%' }, { top: '32%', left: '60%' },
    // Row 3 (Offset from Row 2)
    { top: '44%', left: '30%' }, { top: '44%', left: '50%' }, { top: '44%', left: '70%' },
    // Row 4 (Widest row, offset from Row 3)
    { top: '56%', left: '20%' }, { top: '56%', left: '40%' }, { top: '56%', left: '60%' }, { top: '56%', left: '80%' },
     // Row 5 (Like Row 3)
    { top: '68%', left: '30%' }, { top: '68%', left: '50%' }, { top: '68%', left: '70%' },
    // Row 6 (Like Row 2 - near bottom)
    { top: '80%', left: '40%' }, { top: '80%', left: '60%' },
];
// *** END NEW Pin Layout Definition ***

// The Component
const ThemePlinkoGame: React.FC<ThemePlinkoGameProps> = ({
    isOpen, onClose, currentTheme, onThemeChange
}) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [result, setResult] = useState<AnimationOutcome | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [currentAnimationName, setCurrentAnimationName] = useState<string>('');
    const boardRef = useRef<HTMLDivElement>(null);

    // Function to start/restart the game
    const startGame = useCallback(() => {
        console.log("Starting Plinko Game");
        setResult(null);
        setMessage("Dropping ball...");
        setIsAnimating(false); // Reset animation state first

        // Choose a random animation path/outcome
        const randomIndex = Math.floor(Math.random() * ANIMATION_KEYS.length);
        const randomAnimation = ANIMATION_KEYS[randomIndex];
        console.log("Chosen Animation:", randomAnimation);
        setCurrentAnimationName(randomAnimation);

        // Use a short timeout to allow React to apply the new animation name
        // before setting isAnimating to true, ensuring restart works
        setTimeout(() => {
             if (isOpen) { // Check if still open before starting
                 setIsAnimating(true);
             }
        }, 50);

    }, [isOpen]); // Added isOpen dependency

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
            setTimeout(onClose, 1200); // Show result for 2.5 seconds
        }
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="plinko-game-overlay" onClick={onClose}>
            <div className="plinko-game-modal" onClick={(e) => e.stopPropagation()}>
                <h4></h4>

                <div className="plinko-board" ref={boardRef}>
                    {/* Render Pins */}
                    {pinLayout.map((pin, index) => (
                        <div
                            key={`pin-${index}`}
                            className="plinko-pin"
                            style={{ top: pin.top, left: pin.left }}
                        ></div>
                    ))}

                    {/* Ball */}
                    <div className={`plinko-ball ${isAnimating ? 'dropping' : ''}`}
                         // Apply animation name dynamically
                         style={{ animationName: isAnimating ? currentAnimationName : 'none' }}
                         // Event listener for when animation finishes
                         onAnimationEnd={handleAnimationEnd}
                    ></div>

                    {/* Labels */}
                    <div className="plinko-label-light">LIGHT</div>
                    <div className="plinko-label-dark">DARK</div>
                </div>

                <p className="plinko-message" aria-live="polite">
                    {/* Display message based on state */}
                    {result ? message : isAnimating ? "Dropping ball..." : message || ' '}
                </p>


            </div>
        </div>
    );
};

export default ThemePlinkoGame;