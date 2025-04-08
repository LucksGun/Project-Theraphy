// src/PersonaCupGame.tsx - COMPLETE Version with Shuffle Fix

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// Import types from App.tsx (ensure App.tsx exports them)
import { Persona, PersonaInfo, KeyValidationStatus, GeminiModel } from './App';
import './PersonaCupGame.css'; // Import the CSS for styling

// --- Component Props ---
interface PersonaCupGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void;
    keyStatus: KeyValidationStatus; // Still needed for MODEL check
    currentSelectedModel: GeminiModel;
    allPersonas: PersonaInfo[]; // Use all passed personas
    restrictedModels: GeminiModel[];
}

// --- Internal State for each Cup ---
interface CupState {
    id: number; // e.g., 1, 2, 3
    personaInfo: PersonaInfo | null; // Store the full PersonaInfo object
    order: number; // Visual position index (0, 1, 2) - determines CSS class/style
    isChosen: boolean;
    isRevealed: boolean;
}

// --- Constants ---
const SHOW_DELAY_MS = 1500; // Time to show initial persona placement
const SHUFFLE_MOVE_DELAY_MS = 100; // Short delay between triggering moves
const SHUFFLE_TRANSITION_MS = 400; // Duration of CSS transition for one move (make sure this matches CSS)
const NUM_SHUFFLE_MOVES = 5; // Number of shuffle steps
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
    // Ref to manage shuffle timeouts
    const shuffleTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // --- Determine available personas for the game ---
    // Use ALL personas passed in, game button enable logic is in App.tsx
    const personasForGame = useMemo(() => {
        console.log("Populating game with ALL defined personas.");
        return allPersonas;
    }, [allPersonas]);

    // --- Cleanup timeouts ---
    const clearShuffleTimeouts = useCallback(() => {
        console.log(`Clearing ${shuffleTimeoutsRef.current.length} shuffle timeouts.`);
        shuffleTimeoutsRef.current.forEach(clearTimeout);
        shuffleTimeoutsRef.current = [];
    },[]); // No dependencies needed

    // --- Game Setup Logic (Wrapped in useCallback) ---
    const setupGame = useCallback(() => {
        clearShuffleTimeouts(); // Clear any pending timeouts from previous runs
        setMessage(null);
        setPhase('initializing');
        console.log(`Setting up game. Personas available: ${personasForGame.length}`);

        // Check if enough personas are defined (should be handled by button disable in App.tsx, but good fallback)
        if (personasForGame.length < 3) {
            console.warn("Not enough defined personas (<3) for the cup game.");
            setMessage(`Game needs at least 3 Personas defined in App.tsx! (Found ${personasForGame.length})`);
            const closeTimer = setTimeout(onClose, RESTART_DELAY_MS);
             shuffleTimeoutsRef.current.push(closeTimer); // Track this timeout
            return;
        }

        // Shuffle available personas and pick the first 3 for this round
        const shuffledPersonas = shuffleArray(personasForGame);
        const gamePersonas = shuffledPersonas.slice(0, 3);
        console.log("Personas in this round:", gamePersonas.map(p=>p.value));

        // Assign to cups with initial order (0, 1, 2)
        const initialCups: CupState[] = [
            { id: 1, personaInfo: gamePersonas[0], order: 0, isChosen: false, isRevealed: false },
            { id: 2, personaInfo: gamePersonas[1], order: 1, isChosen: false, isRevealed: false },
            { id: 3, personaInfo: gamePersonas[2], order: 2, isChosen: false, isRevealed: false },
        ];
        setCups(initialCups);
        setPhase('showing');

        // --- Start Shuffling Timer ---
        console.log("Setting timer to start shuffle...");
        const initialShuffleTimer = setTimeout(() => {
            setPhase('shuffling');
            setMessage("Shuffling...");
            console.log("Shuffle timer fired, starting moves...");

            // --- 5 Move Shuffle Logic ---
            let currentMove = 0;
            const performShuffleMove = () => {
                 // Check if component is still mounted / phase is still shuffling
                 // (Could have been closed during timeout chain)
                 if (phase !== 'shuffling') {
                    console.log("Shuffle move called but phase changed, stopping.");
                    clearShuffleTimeouts(); // Ensure no more moves scheduled
                    return;
                 }

                if (currentMove >= NUM_SHUFFLE_MOVES) {
                    console.log("Finished 5 shuffle moves.");
                    setPhase('selecting');
                    setMessage("Pick a cup!");
                    return; // Stop after 5 moves
                }

                // Calculate new random order and update state
                const orders = shuffleArray([0, 1, 2]);
                console.log(`Shuffle Move ${currentMove + 1}: New order -> ${orders.join(',')}`);
                setCups(prevCups => prevCups.map((cup) => {
                    // Find the new order for this cup's original index (0, 1, or 2)
                    const originalIndex = initialCups.findIndex(c => c.id === cup.id);
                    return { ...cup, order: orders[originalIndex] };
                }));
                currentMove++;

                // Schedule the next move
                const nextMoveTimer = setTimeout(performShuffleMove, SHUFFLE_TRANSITION_MS + SHUFFLE_MOVE_DELAY_MS);
                 shuffleTimeoutsRef.current.push(nextMoveTimer);
            };

            // Start the first move slightly after entering shuffle phase
             const firstMoveTimer = setTimeout(performShuffleMove, SHUFFLE_MOVE_DELAY_MS);
             shuffleTimeoutsRef.current.push(firstMoveTimer);

        }, SHOW_DELAY_MS); // Wait before shuffling starts

        shuffleTimeoutsRef.current.push(initialShuffleTimer);
        // Ensure dependencies of useCallback are correct
    }, [personasForGame, onClose, clearShuffleTimeouts, phase]); // Added phase to condition in performShuffleMove

    // --- Effect to Setup/Cleanup Game When Modal Opens/Closes ---
    useEffect(() => {
        if (isOpen) {
             // Only setup if the phase is idle (prevents re-triggering on phase changes)
             // Or if restarting due to error
             if (phase === 'idle' || phase === 'restartingOnError') {
                 console.log("Modal opened or restarting, setting up game. Current phase:", phase);
                setupGame();
             }

            // Return the cleanup function. This runs ONLY when:
            // 1. The component unmounts.
            // 2. The `isOpen` prop changes from true to false.
            return () => {
                console.log("Game closing or unmounting, clearing timeouts.");
                clearShuffleTimeouts();
            };
        } else {
             // If the modal is explicitly closed (isOpen becomes false), ensure state reset
             if (phase !== 'idle') {
                 console.log("Modal closed externally, resetting state.");
                 setPhase('idle');
                 setCups([]);
                 setMessage(null);
                 clearShuffleTimeouts(); // Also clear here just in case
             }
        }
    // Dependencies: isOpen triggers setup/cleanup. setupGame is memoized. phase handles reset on close.
    }, [isOpen, setupGame, phase, clearShuffleTimeouts]);


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
        const hasValidKey = keyStatus.isValid === true; // Use passed keyStatus

        if (isModelRestricted && !hasValidKey) {
            // CONFLICT!
            console.log(`Conflict: Model '${currentSelectedModel}' is restricted, but key is not valid.`);
            setMessage(`Oops! Persona '${chosenCup.personaInfo.label}' chosen, but your selected AI Model ('${currentSelectedModel}') requires a valid key. Let's roll again!`);
            setPhase('restartingOnError');
            // Use timeout to show message, then reset (useEffect will trigger setupGame)
             const restartTimer = setTimeout(() => {
                 // Only reset phase, useEffect will handle setup
                 setPhase('idle');
             }, RESTART_DELAY_MS);
            shuffleTimeoutsRef.current.push(restartTimer); // Track for cleanup
        } else {
            // NO Conflict - Success
             console.log("No model conflict detected.");
             setMessage(`You got: ${chosenCup.personaInfo.label}!`);
             // Use timeout to show result, then call callback which closes modal
             const successTimer = setTimeout(() => {
                onPersonaSelected(selectedPersonaValue); // Send selected persona back to App.tsx
            }, REVEAL_DELAY_MS);
             shuffleTimeoutsRef.current.push(successTimer); // Track for cleanup
        }
    };


    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return (
        // Close on overlay click (optional)
        <div className="persona-cup-game-overlay" onClick={onClose}>
            {/* Prevent closing when clicking modal itself */}
            <div className="persona-cup-game-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Persona Shell Game!</h3>

                <div className="cups-container">
                    {cups.map(cup => (
                        <div
                            key={cup.id}
                            // Apply classes for state and order for styling/transitions
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''}`}
                            // Apply transform style directly for smooth transition based on order
                            // Adjust 110px based on cup width (80px) + desired gap (30px -> 80 + 30 = 110)
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }}
                            onClick={() => handleCupClick(cup.id)}
                            role="button"
                            tabIndex={phase === 'selecting' ? 0 : -1} // Make clickable only during selection
                            aria-label={`Cup ${cup.id}`}
                            aria-hidden={phase === 'shuffling'} // Hide from accessibility during shuffle
                        >
                            {/* Use emoji as the visual - shows '?' if revealed but no persona somehow */}
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

                {/* Display messages based on phase */}
                 <p className="game-message" aria-live="polite">
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
                    // Disable during critical transitions to avoid interrupting state
                    disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'restartingOnError'}
                 >
                    Cancel Game
                 </button>
            </div>
        </div>
    );
};

export default PersonaCupGame;