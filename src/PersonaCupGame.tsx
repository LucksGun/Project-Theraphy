// src/PersonaCupGame.tsx - FINAL Version (v3 - Fix timing issue in shuffle check)

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// Import types from App.tsx (ensure App.tsx exports them)
import { Persona, PersonaInfo, KeyValidationStatus, GeminiModel } from './App';
import './PersonaCupGame.css'; // Import the CSS for styling

// --- Component Props ---
interface PersonaCupGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void;
    keyStatus: KeyValidationStatus;
    currentSelectedModel: GeminiModel;
    allPersonas: PersonaInfo[];
    restrictedModels: GeminiModel[];
}

// --- Internal State for each Cup ---
interface CupState {
    id: number;
    personaInfo: PersonaInfo | null;
    order: number;
    isChosen: boolean;
    isRevealed: boolean;
}

// --- Constants ---
const SHOW_DELAY_MS = 1500;
const SHUFFLE_MOVE_DELAY_MS = 100;
const SHUFFLE_TRANSITION_MS = 400; // Duration of CSS transition for one move
const NUM_SHUFFLE_MOVES = 5;
const REVEAL_DELAY_MS = 1500;
const RESTART_DELAY_MS = 3000;

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };


// --- The Component ---
const PersonaCupGame: React.FC<PersonaCupGameProps> = ({
    isOpen, onClose, onPersonaSelected, keyStatus, currentSelectedModel, allPersonas, restrictedModels
}) => {
    const [cups, setCups] = useState<CupState[]>([]);
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'showing' | 'shuffling' | 'selecting' | 'revealing' | 'restartingOnError' | 'closing'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const shuffleTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const isMountedRef = useRef<boolean>(false);
    const initialCupsRef = useRef<CupState[]>([]); // Ref to store initial cup setup

    // Determine available personas based on key status
    const availablePersonasForGame = useMemo(() => {
        console.log("Calculating available personas. Key Valid:", keyStatus.isValid);
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

    // Cleanup timeouts helper (memoized)
    const clearShuffleTimeouts = useCallback(() => {
        console.log(`Clearing ${shuffleTimeoutsRef.current.length} shuffle timeouts.`);
        shuffleTimeoutsRef.current.forEach(clearTimeout);
        shuffleTimeoutsRef.current = [];
    },[]);

    // Game Setup Logic (memoized)
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) { console.log("setupGame called but component not mounted/visible."); return; }
        clearShuffleTimeouts();
        setMessage(null);
        setPhase('initializing');
        console.log(`Setting up game. Personas available: ${availablePersonasForGame.length}`);

        if (availablePersonasForGame.length < 3) {
            console.warn("Not enough available personas for the cup game.");
            setMessage(`Need a valid key for more personas to play! (Available: ${availablePersonasForGame.length})`);
            setPhase('closing');
            const closeTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, RESTART_DELAY_MS);
            shuffleTimeoutsRef.current.push(closeTimer);
            return;
        }

        const shuffledPersonas = shuffleArray(availablePersonasForGame);
        const gamePersonas = shuffledPersonas.slice(0, 3);
        console.log("Personas in this round:", gamePersonas.map(p=>p.value));
        // Store initial setup in ref AND state
        initialCupsRef.current = [ { id: 1, personaInfo: gamePersonas[0], order: 0, isChosen: false, isRevealed: false }, { id: 2, personaInfo: gamePersonas[1], order: 1, isChosen: false, isRevealed: false }, { id: 3, personaInfo: gamePersonas[2], order: 2, isChosen: false, isRevealed: false }, ];
        setCups(initialCupsRef.current);
        setPhase('showing');

        // Start Shuffling Timer
        console.log("Setting timer to start shuffle...");
        const initialShuffleTimer = setTimeout(() => {
             if (!isMountedRef.current) return; // Check mount status ONLY
            setPhase('shuffling');
            setMessage("Shuffling...");
            console.log("Shuffle timer fired, starting moves...");

            let currentMove = 0;
            const performShuffleMove = () => {
                 // *** REMOVED PHASE CHECK HERE ***
                 if (!isMountedRef.current) {
                    console.log("Shuffle move skipped: component unmounted or closed.");
                    clearShuffleTimeouts();
                    return;
                 }

                if (currentMove >= NUM_SHUFFLE_MOVES) { console.log("Finished 5 shuffle moves."); setPhase('selecting'); setMessage("Pick a cup!"); return; }

                const orders = shuffleArray([0, 1, 2]); console.log(`Shuffle Move ${currentMove + 1}: New order -> ${orders.join(',')}`);
                // Use functional update + read from ref for initial state
                setCups(prevCups => prevCups.map((cup) => {
                    // Use initialCupsRef.current to get stable initial persona info
                    const originalCup = initialCupsRef.current.find(c => c.id === cup.id);
                    const originalIndex = initialCupsRef.current.findIndex(c => c.id === cup.id);
                    return { ...cup, order: orders[originalIndex], personaInfo: originalCup?.personaInfo ?? null };
                }));
                currentMove++;
                const nextMoveTimer = setTimeout(performShuffleMove, SHUFFLE_TRANSITION_MS + SHUFFLE_MOVE_DELAY_MS);
                shuffleTimeoutsRef.current.push(nextMoveTimer);
            };
            // Start the first move
            const firstMoveTimer = setTimeout(performShuffleMove, SHUFFLE_MOVE_DELAY_MS);
            shuffleTimeoutsRef.current.push(firstMoveTimer);

        }, SHOW_DELAY_MS);
        shuffleTimeoutsRef.current.push(initialShuffleTimer);
    // Removed phase from dependencies
    }, [availablePersonasForGame, onClose, clearShuffleTimeouts]);


    // Effect for setup and cleanup based on isOpen
    useEffect(() => {
        if (isOpen) {
            isMountedRef.current = true;
            console.log("useEffect [isOpen=true]: Mounted ref set.");
            if (phase === 'idle' || phase === 'restartingOnError') {
                console.log(`useEffect: Triggering setupGame. Current phase: ${phase}`);
                const setupTimer = setTimeout(() => { if (isMountedRef.current) { setupGame(); } }, 0);
                shuffleTimeoutsRef.current.push(setupTimer);
            }
            return () => {
                console.log("useEffect [cleanup for isOpen=true]: Clearing timeouts. Setting isMounted=false.");
                isMountedRef.current = false;
                clearShuffleTimeouts();
                setPhase('idle'); setCups([]); setMessage(null);
            };
        } else {
            isMountedRef.current = false;
            if (phase !== 'idle') { setPhase('idle'); setCups([]); setMessage(null); clearShuffleTimeouts(); }
        }
    }, [isOpen, setupGame, clearShuffleTimeouts, phase]); // Keep phase for restart trigger


    // Cup Click Handler
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting' || !isMountedRef.current) return;
        const chosenCup = cups.find(c => c.id === cupId);
        if (!chosenCup || !chosenCup.personaInfo) return;
        console.log(`Cup ${cupId} chosen. Persona: ${chosenCup.personaInfo.value}`);
        setPhase('revealing');
        setCups(prevCups => prevCups.map(c => ({ ...c, isChosen: c.id === cupId, isRevealed: true })));
        const selectedPersonaValue = chosenCup.personaInfo.value;
        const isModelRestricted = restrictedModels.includes(currentSelectedModel);
        const hasValidKey = keyStatus.isValid === true;
        if (isModelRestricted && !hasValidKey) {
            console.log(`Conflict: Model '${currentSelectedModel}' is restricted, but key is not valid.`);
            setMessage(`Oops! Persona '${chosenCup.personaInfo.label}' chosen, but your selected AI Model ('${currentSelectedModel}') needs a valid key. Let's roll again!`);
            setPhase('restartingOnError');
            const restartTimer = setTimeout(() => {
                // Set phase to idle, useEffect watching phase will trigger setupGame again
                if (isMountedRef.current) setPhase('idle');
            }, RESTART_DELAY_MS);
            shuffleTimeoutsRef.current.push(restartTimer);
        } else {
            console.log("No model conflict detected.");
             setMessage(`You got: ${chosenCup.personaInfo.label}!`);
             const successTimer = setTimeout(() => {
                if (isMountedRef.current) onPersonaSelected(selectedPersonaValue);
            }, REVEAL_DELAY_MS);
             shuffleTimeoutsRef.current.push(successTimer);
        }
    };


    // Render null if not open
    if (!isOpen) return null;

    // Render Logic
    return (
        <div className="persona-cup-game-overlay" onClick={onClose}>
            <div className="persona-cup-game-modal" onClick={(e) => e.stopPropagation()}>
               <h3>Persona Shell Game!</h3>
                <div className="cups-container">
                    {cups.map(cup => ( <div key={cup.id} className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''}`} style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} onClick={() => handleCupClick(cup.id)} role="button" tabIndex={phase === 'selecting' ? 0 : -1} aria-label={`Cup ${cup.id}`} aria-hidden={phase === 'shuffling'} > <div className="cup-graphic">{cup.isRevealed ? cup.personaInfo?.emoji || '❓' : '🥤'}</div> {phase === 'showing' && !cup.isRevealed && ( <div className="cup-label cup-label-initial">{cup.personaInfo?.label}</div> )} {cup.isRevealed && ( <div className="cup-label cup-label-revealed">{cup.personaInfo?.label || '??'}</div> )} </div> ))}
                </div>
                 <p className="game-message" aria-live="polite">
                    {phase === 'initializing' && "Getting ready..."}
                    {phase === 'showing' && "Watch closely..."}
                    {phase === 'shuffling' && "Shuffling..."}
                    {phase === 'selecting' && (message || "Pick a cup!")}
                    {phase === 'revealing' && (message || "Revealing...")}
                    {phase === 'restartingOnError' && (message || "Restarting...")}
                    {phase === 'closing' && (message || "Closing...")}
                    {phase === 'idle' && ""}
                 </p>
                 <button onClick={onClose} className="game-close-button" disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'restartingOnError' || phase === 'closing'}> Cancel Game </button>
            </div>
        </div>
    );
};

export default PersonaCupGame;