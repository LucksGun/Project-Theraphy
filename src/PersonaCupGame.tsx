// src/PersonaCupGame.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Import types from App.tsx (ensure App.tsx exports them)
import { Persona, PersonaInfo, GeminiModel, KeyValidationStatus } from './App';
import './PersonaCupGame.css'; // Import the CSS for styling

// --- Component Props ---
interface PersonaCupGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void;
    keyStatus: KeyValidationStatus;
    currentSelectedModel: GeminiModel;
    allPersonas: PersonaInfo[]; // Pass the full list with details
    restrictedModels: GeminiModel[];
}

// --- Internal State for each Cup ---
interface CupState {
    id: number; // e.g., 1, 2, 3
    personaInfo: PersonaInfo | null; // Store the full PersonaInfo object
    order: number; // Visual position index (0, 1, 2)
    isChosen: boolean;
    isRevealed: boolean;
}

// --- Constants ---
const SHOW_DELAY_MS = 1500; // Time to show initial persona placement
const SHUFFLE_DURATION_MS = 2000; // Duration of shuffle animation
const REVEAL_DELAY_MS = 1500; // Time to show revealed persona before closing/restarting
const RESTART_DELAY_MS = 3000; // Time to show error message before restarting

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => {
    let currentIndex = array.length, randomIndex;
    const newArray = [...array]; // Create a copy
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]];
    }
    return newArray;
};


// --- The Component ---
const PersonaCupGame: React.FC<PersonaCupGameProps> = ({
    isOpen, onClose, onPersonaSelected, keyStatus, currentSelectedModel, allPersonas, restrictedModels
}) => {
    const [cups, setCups] = useState<CupState[]>([]);
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'showing' | 'shuffling' | 'selecting' | 'revealing' | 'restartingOnError'>('idle');
    const [message, setMessage] = useState<string | null>(null);

    // Determine available personas for this game instance based on key status
    const availablePersonasForGame = useMemo(() => {
        console.log("Calculating available personas. Key Valid:", keyStatus.isValid);
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

    // --- Game Setup Logic ---
    const setupGame = useCallback(() => {
        setMessage(null);
        setPhase('initializing');
        console.log(`Setting up game. Available personas: ${availablePersonasForGame.length}`);

        if (availablePersonasForGame.length < 3) {
            console.warn("Not enough available personas for the cup game.");
            setMessage(`Need a valid key to access more personas to play! (Have ${availablePersonasForGame.length})`);
            // Close automatically after showing message
            setTimeout(onClose, RESTART_DELAY_MS);
            return;
        }

        // Shuffle available personas and pick the first 3 for this round
        const shuffledPersonas = shuffleArray(availablePersonasForGame);
        const gamePersonas = shuffledPersonas.slice(0, 3);
        console.log("Personas in this round:", gamePersonas.map(p=>p.value));

        // Assign to cups with initial order
        const initialCups: CupState[] = [
            { id: 1, personaInfo: gamePersonas[0], order: 0, isChosen: false, isRevealed: false },
            { id: 2, personaInfo: gamePersonas[1], order: 1, isChosen: false, isRevealed: false },
            { id: 3, personaInfo: gamePersonas[2], order: 2, isChosen: false, isRevealed: false },
        ];
        setCups(initialCups);
        setPhase('showing'); // Briefly show assignments

        // --- Start Shuffling Timer ---
        const shuffleTimer = setTimeout(() => {
            setPhase('shuffling');
            // Randomly assign new visual order indices
            const orders = shuffleArray([0, 1, 2]);
            // Update cup state with new order - CSS transition handles the visual move
            setCups(prevCups => prevCups.map((cup, index) => ({
                 ...cup,
                 order: orders[index],
                 // Reset reveal/chosen status from previous rounds if any
                 isRevealed: false,
                 isChosen: false
            })));

            // --- End Shuffling Timer ---
            const endShuffleTimer = setTimeout(() => {
                setPhase('selecting');
                setMessage("Pick a cup!"); // Prompt user
            }, SHUFFLE_DURATION_MS); // Wait for shuffle animation to finish

            // Cleanup endShuffleTimer if component unmounts or resets
             return () => clearTimeout(endShuffleTimer);

        }, SHOW_DELAY_MS); // Wait before shuffling

         // Cleanup shuffleTimer if component unmounts or resets
         return () => clearTimeout(shuffleTimer);

        // We don't return cleanup here directly, but manage timers inside
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availablePersonasForGame, onClose]); // Dependencies for setup

    // --- Effect to Setup Game When Modal Opens ---
    useEffect(() => {
        if (isOpen && phase === 'idle') { // Only setup if open and idle
            setupGame();
        } else if (!isOpen && phase !== 'idle') {
            setPhase('idle'); // Reset phase if modal is closed externally
            setCups([]);
            setMessage(null);
        }
    }, [isOpen, phase, setupGame]);

    // --- Cup Click Handler ---
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting') return; // Only allow clicks during selection phase

        const chosenCup = cups.find(c => c.id === cupId);
        if (!chosenCup || !chosenCup.personaInfo) return; // Should not happen

        console.log(`Cup ${cupId} chosen. Persona: ${chosenCup.personaInfo.value}`);
        setPhase('revealing');
        // Mark chosen cup and reveal all (or just chosen based on CSS)
        setCups(prevCups => prevCups.map(c => ({
            ...c,
            isChosen: c.id === cupId,
            isRevealed: true // Reveal all to show result
        })));

        const selectedPersonaValue = chosenCup.personaInfo.value;

        // --- Check for Model Conflict ---
        const isModelRestricted = restrictedModels.includes(currentSelectedModel);
        const hasValidKey = keyStatus.isValid === true;

        if (isModelRestricted && !hasValidKey) {
            // CONFLICT!
            console.log(`Conflict: Model '${currentSelectedModel}' is restricted, but key is not valid.`);
            setMessage(`Oops! Persona '${chosenCup.personaInfo.label}' chosen, but your selected AI Model ('${currentSelectedModel}') requires a valid key. Let's roll again!`);
            setPhase('restartingOnError');
            // Use timeout to show message, then reset
            setTimeout(() => {
                setupGame(); // Restart game
            }, RESTART_DELAY_MS);
        } else {
            // NO Conflict - Success
             console.log("No model conflict detected.");
             setMessage(`You got: ${chosenCup.personaInfo.label}!`);
             // Use timeout to show result, then call callback and close
             setTimeout(() => {
                onPersonaSelected(selectedPersonaValue); // Send selected persona back to App.tsx
                // Optional: onClose(); // App.tsx usually closes modal after selection
            }, REVEAL_DELAY_MS);
        }
    };


    // Don't render anything if not open
    if (!isOpen) return null;

    return (
        <div className="persona-cup-game-overlay" onClick={onClose}> {/* Close on overlay click */}
            <div className="persona-cup-game-modal" onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking modal */}
                <h3>Persona Shell Game!</h3>

                <div className="cups-container">
                    {cups.map(cup => (
                        <div
                            key={cup.id}
                            // Apply classes for state and order
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''}`}
                            // Apply transform style directly for smooth transition based on order
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} // 0->-110px, 1->0px, 2->110px (adjust 110px based on gap/width)
                            onClick={() => handleCupClick(cup.id)}
                            role="button"
                            aria-label={`Cup ${cup.id + 1}`}
                        >
                            {/* Use emoji as the visual */}
                            <div className="cup-graphic">{cup.isRevealed ? cup.personaInfo?.emoji || '❓' : '🥤'}</div>

                            {/* Label shown during initial 'showing' phase */}
                            {phase === 'showing' && !cup.isRevealed && (
                                <div className="cup-label cup-label-initial">
                                    {cup.personaInfo?.label}
                                 </div>
                            )}

                             {/* Label shown after reveal */}
                             {cup.isRevealed && (
                                 <div className="cup-label cup-label-revealed">
                                      {cup.personaInfo?.label || '??'}
                                 </div>
                             )}
                        </div>
                    ))}
                </div>

                <p className="game-message" aria-live="polite">
                     {/* Display messages based on phase */}
                     {phase === 'showing' && "Watch closely..."}
                     {phase === 'shuffling' && "Shuffling..."}
                     {phase === 'selecting' && (message || "Pick a cup!")}
                     {phase === 'revealing' && (message || "Revealing...")}
                     {phase === 'restartingOnError' && (message || "Restarting...")}
                     {phase === 'initializing' && "Getting ready..."}
                     {phase === 'idle' && ""} {/* Should not be visible when idle */}
                 </p>

                 {/* Optional Cancel Button */}
                 <button
                    onClick={onClose}
                    className="game-close-button"
                    disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'restartingOnError'} // Disable during transitions
                 >
                    Cancel
                 </button>
            </div>
        </div>
    );
};

export default PersonaCupGame;