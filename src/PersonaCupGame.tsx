// src/PersonaCupGame.tsx - Updated with No Key Requirement & 5-Move Shuffle

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
    id: number;
    personaInfo: PersonaInfo | null;
    order: number; // Visual position index (0, 1, 2) - determines CSS class/style
    isChosen: boolean;
    isRevealed: boolean;
}

// --- Constants ---
const SHOW_DELAY_MS = 1500;
const SHUFFLE_MOVE_DELAY_MS = 100; // Short delay between triggering moves
const SHUFFLE_TRANSITION_MS = 400; // Duration of CSS transition for one move
const NUM_SHUFFLE_MOVES = 5; // Make it 5 moves
const REVEAL_DELAY_MS = 1500;
const RESTART_DELAY_MS = 3000;

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { /* ... (same shuffle function as before) ... */ let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };


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
    // *** CHANGE: Use ALL personas passed in, ignore keyStatus for populating game ***
    const personasForGame = useMemo(() => {
        console.log("Populating game with ALL defined personas.");
        return allPersonas;
    }, [allPersonas]);

    // --- Cleanup timeouts ---
    const clearShuffleTimeouts = () => {
        shuffleTimeoutsRef.current.forEach(clearTimeout);
        shuffleTimeoutsRef.current = [];
    };

    // --- Game Setup Logic ---
    const setupGame = useCallback(() => {
        clearShuffleTimeouts(); // Clear any pending timeouts from previous runs
        setMessage(null);
        setPhase('initializing');
        console.log(`Setting up game. Personas available: ${personasForGame.length}`);

        // *** CHANGE: Check based on passed `allPersonas` length ***
        if (personasForGame.length < 3) {
            console.warn("Not enough defined personas (<3) for the cup game.");
            setMessage(`Game needs at least 3 Personas defined in App.tsx! (Found ${personasForGame.length})`);
            setTimeout(onClose, RESTART_DELAY_MS);
            return;
        }

        const shuffledPersonas = shuffleArray(personasForGame);
        const gamePersonas = shuffledPersonas.slice(0, 3);
        console.log("Personas in this round:", gamePersonas.map(p=>p.value));

        const initialCups: CupState[] = [
            { id: 1, personaInfo: gamePersonas[0], order: 0, isChosen: false, isRevealed: false },
            { id: 2, personaInfo: gamePersonas[1], order: 1, isChosen: false, isRevealed: false },
            { id: 3, personaInfo: gamePersonas[2], order: 2, isChosen: false, isRevealed: false },
        ];
        setCups(initialCups);
        setPhase('showing');

        // --- Start Shuffling Timer ---
        const initialShuffleTimer = setTimeout(() => {
            setPhase('shuffling');
            setMessage("Shuffling...");

            // --- 5 Move Shuffle Logic ---
            let currentMove = 0;
            const performShuffleMove = () => {
                if (currentMove >= NUM_SHUFFLE_MOVES) {
                    setPhase('selecting');
                    setMessage("Pick a cup!");
                    return; // Stop after 5 moves
                }

                // Calculate new random order and update state
                const orders = shuffleArray([0, 1, 2]);
                setCups(prevCups => prevCups.map((cup, index) => ({
                    ...cup,
                    order: orders[index]
                })));
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [personasForGame, onClose]); // Dependencies for setup

    // --- Effect to Setup/Cleanup Game When Modal Opens/Closes ---
    useEffect(() => {
        if (isOpen) {
            if(phase === 'idle') { // Only setup if idle, prevents re-setup on re-renders
                 setupGame();
            }
        } else {
            // Cleanup on close
            clearShuffleTimeouts();
            if (phase !== 'idle') {
                setPhase('idle');
                setCups([]);
                setMessage(null);
            }
        }
        // Cleanup timeouts if component unmounts while open
        return clearShuffleTimeouts;
    }, [isOpen, phase, setupGame]); // Rerun setup only when isOpen changes or phase becomes idle

    // --- Cup Click Handler (Model conflict check remains) ---
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting') return;

        const chosenCup = cups.find(c => c.id === cupId);
        if (!chosenCup || !chosenCup.personaInfo) return;

        console.log(`Cup ${cupId} chosen. Persona: ${chosenCup.personaInfo.value}`);
        setPhase('revealing');
        setCups(prevCups => prevCups.map(c => ({ ...c, isChosen: c.id === cupId, isRevealed: true })));

        const selectedPersonaValue = chosenCup.personaInfo.value;

        // Check for conflict between selected AI MODEL and user's key status
        const isModelRestricted = restrictedModels.includes(currentSelectedModel);
        const hasValidKey = keyStatus.isValid === true; // Use passed keyStatus

        if (isModelRestricted && !hasValidKey) {
            // CONFLICT!
            console.log(`Conflict: Model '${currentSelectedModel}' is restricted, but key is not valid.`);
            setMessage(`Oops! Persona '${chosenCup.personaInfo.label}' chosen, but your selected AI Model ('${currentSelectedModel}') needs a valid key. Let's roll again!`);
            setPhase('restartingOnError');
            const restartTimer = setTimeout(setupGame, RESTART_DELAY_MS);
            shuffleTimeoutsRef.current.push(restartTimer); // Track for cleanup
        } else {
            // NO Conflict - Success
             console.log("No model conflict detected.");
             setMessage(`You got: ${chosenCup.personaInfo.label}!`);
             const successTimer = setTimeout(() => {
                onPersonaSelected(selectedPersonaValue);
                // Closing is handled by App.tsx via onPersonaSelected now
            }, REVEAL_DELAY_MS);
             shuffleTimeoutsRef.current.push(successTimer); // Track for cleanup
        }
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="persona-cup-game-overlay" onClick={onClose}>
            <div className="persona-cup-game-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Persona Shell Game!</h3>

                <div className="cups-container">
                    {cups.map(cup => (
                        <div
                            key={cup.id}
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''}`}
                            // Apply transform based on order - ensure CSS handles transition
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} // Adjust 110px based on cup width+gap
                            onClick={() => handleCupClick(cup.id)}
                            role="button"
                            tabIndex={phase === 'selecting' ? 0 : -1} // Make clickable only during selection
                            aria-label={`Cup ${cup.id}`}
                        >
                            <div className="cup-graphic">{cup.isRevealed ? cup.personaInfo?.emoji || '❓' : '🥤'}</div>
                             {phase === 'showing' && !cup.isRevealed && ( <div className="cup-label cup-label-initial">{cup.personaInfo?.label}</div> )}
                             {cup.isRevealed && ( <div className="cup-label cup-label-revealed">{cup.personaInfo?.label || '??'}</div> )}
                        </div>
                    ))}
                </div>

                 <p className="game-message" aria-live="polite">
                     {phase === 'showing' && "Watch closely..."}
                     {phase === 'shuffling' && "Shuffling..."}
                     {phase === 'selecting' && (message || "Pick a cup!")}
                     {phase === 'revealing' && (message || "Revealing...")}
                     {phase === 'restartingOnError' && (message || "Restarting...")}
                     {phase === 'initializing' && "Getting ready..."}
                     {phase === 'idle' && ""}
                 </p>

                 <button onClick={onClose} className="game-close-button" disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'restartingOnError'}>
                    Cancel Game
                 </button>
            </div>
        </div>
    );
};

export default PersonaCupGame;