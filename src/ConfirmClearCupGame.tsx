// src/ConfirmClearCupGame.tsx - FINAL Version with Initial Reveal & 5-Move Shuffle

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ConfirmClearCupGame.css'; // Ensure CSS file exists and is correctly named/imported

// --- Component Props ---
interface ConfirmClearCupGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void; // Callback for successful confirmation
}

// --- Internal State for each Cup ---
interface CupState {
    id: number;
    order: number; // Visual position
    isChosen: boolean;
    isRevealed: boolean; // Only true for the chosen cup AFTER selection
    isConfirmCup: boolean;
    showConfirmInitially: boolean; // Flag for initial reveal phase
} 

// --- Constants ---
const INITIAL_REVEAL_MS = 3000; // How long to show the confirm cup location
const PRE_SHUFFLE_DELAY_MS = 300; // Short pause after hiding confirm cup before shuffle starts
const SHUFFLE_MOVE_DELAY_MS = 100; // Short delay between triggering moves in sequence
const SHUFFLE_TRANSITION_MS = 400; // Duration of CSS transition for one move
const NUM_SHUFFLE_MOVES = 5; // <<< Number of shuffle steps
const RESULT_DELAY_MS = 1500; // Delay after showing result before closing
const FAIL_DELAY_MS = 1500; // Delay after picking wrong cup

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };

// --- The Component ---
const ConfirmClearCupGame: React.FC<ConfirmClearCupGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [cups, setCups] = useState<CupState[]>([]);
    // Add 'showingConfirm' phase
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'showingConfirm' | 'pre-shuffle' | 'shuffling' | 'selecting' | 'revealing' | 'closing'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmCupId, setConfirmCupId] = useState<number | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing'); // Added status state

    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const isMountedRef = useRef<boolean>(false);
    const initialCupsRef = useRef<CupState[]>([]); // Ref to store initial cup setup

    // --- Cleanup Timeouts ---
    const clearGameTimeouts = useCallback(() => {
        console.log(`CupConfirm: Clearing ${gameTimeoutsRef.current.length} game timeouts.`);
        gameTimeoutsRef.current.forEach(clearTimeout);
        gameTimeoutsRef.current = [];
    }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearGameTimeouts();
        setMessage("Watch where the 'Confirm' cup starts..."); // Initial message
        setPhase('initializing');
        setStatus('playing'); // Reset status
        console.log("CupConfirm: Setting up game.");

        const winningCup = Math.floor(Math.random() * 3) + 1;
        setConfirmCupId(winningCup);
        console.log("CupConfirm: Winning cup is", winningCup);

        // Store initial setup in ref AND state - Mark which one to show initially
        initialCupsRef.current = [
            { id: 1, order: 0, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 1, showConfirmInitially: winningCup === 1 },
            { id: 2, order: 1, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 2, showConfirmInitially: winningCup === 2 },
            { id: 3, order: 2, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 3, showConfirmInitially: winningCup === 3 },
        ];
        setCups(initialCupsRef.current);
        setPhase('showingConfirm'); // Phase to show the confirm cup

        // Timer to hide the confirm cup again and start shuffle sequence
        const hideTimer = setTimeout(() => {
            if (!isMountedRef.current) return;
            console.log("CupConfirm: Hiding confirm cup location.");
            // Update state to hide the initial reveal marker
            setCups(prevCups => prevCups.map(c => ({ ...c, showConfirmInitially: false })));
            setPhase('pre-shuffle');

            // Timer to actually start shuffling
            const shuffleTimer = setTimeout(() => {
                if (!isMountedRef.current) return;
                setPhase('shuffling');
                setMessage("Shuffling...");
                console.log("CupConfirm: Starting 5-move shuffle...");

                // --- 5 Move Shuffle Logic ---
                let currentMove = 0;
                const performShuffleMove = () => {
                    // Check mount status - phase check is less critical here if cleanup works
                    if (!isMountedRef.current) { console.log("CupConfirm Shuffle move skipped: component unmounted."); clearGameTimeouts(); return; }

                    if (currentMove >= NUM_SHUFFLE_MOVES) {
                        console.log("CupConfirm: Finished 5 shuffle moves.");
                        setPhase('selecting'); setMessage("Pick the 'Confirm' cup!");
                        return; // Stop after 5 moves
                    }

                    const orders = shuffleArray([0, 1, 2]); console.log(`CupConfirm Shuffle Move ${currentMove + 1}: New order -> ${orders.join(',')}`);
                    setCups(prevCups => prevCups.map((cup) => {
                        const originalCup = initialCupsRef.current.find(c => c.id === cup.id);
                        const originalIndex = initialCupsRef.current.findIndex(c => c.id === cup.id);
                        return { ...cup, order: orders[originalIndex], isConfirmCup: originalCup?.isConfirmCup ?? false, isRevealed: false, isChosen: false };
                    }));
                    currentMove++;
                    const nextMoveTimer = setTimeout(performShuffleMove, SHUFFLE_TRANSITION_MS + SHUFFLE_MOVE_DELAY_MS);
                    gameTimeoutsRef.current.push(nextMoveTimer);
                };
                // Start the first move
                const firstMoveTimer = setTimeout(performShuffleMove, SHUFFLE_MOVE_DELAY_MS);
                gameTimeoutsRef.current.push(firstMoveTimer);

            }, PRE_SHUFFLE_DELAY_MS); // Wait brief moment before shuffle starts
            gameTimeoutsRef.current.push(shuffleTimer);

        }, INITIAL_REVEAL_MS); // How long to show the confirm cup
        gameTimeoutsRef.current.push(hideTimer);

    }, [clearGameTimeouts]); // Dependency

    // --- Effect for setup/cleanup ---
    useEffect(() => {
         clearGameTimeouts(); // Clear on open/close
         if (isOpen) {
             isMountedRef.current = true;
             console.log("CupConfirm: Opened.");
             setupGame(); // Initial setup
             return () => { // Cleanup on close or unmount
                console.log("CupConfirm: Cleaning up.");
                isMountedRef.current = false;
                clearGameTimeouts();
                // Reset state fully
                setPhase('idle'); setCups([]); setMessage(null); setConfirmCupId(null); setStatus('playing');
             };
         } else {
             isMountedRef.current = false; // Ensure flag is false if closed externally
         }
    }, [isOpen, setupGame, clearGameTimeouts]); // Depend on stable callbacks and isOpen


    // --- Cup Click Handler ---
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting' || !isMountedRef.current) return;
        console.log(`Cup ${cupId} chosen.`);
        setPhase('revealing');
        // Only set chosen/revealed for the clicked cup
        setCups(prevCups => prevCups.map(c => ({
            ...c,
            isChosen: c.id === cupId,
            isRevealed: c.id === cupId // Only chosen cup is revealed now
        })));

        const wasCorrect = cupId === confirmCupId;

        if (wasCorrect) {
            setStatus('success'); setMessage('Confirmed! Clearing chat...');
            const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, RESULT_DELAY_MS);
            gameTimeoutsRef.current.push(successTimer);
        } else {
            setStatus('failed'); setMessage('Oops! Wrong cup. Action cancelled.');
             const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
             gameTimeoutsRef.current.push(failTimer);
        }
    };

    if (!isOpen) return null;

    // --- Render Logic ---
    return (
        <div className="persona-cup-game-overlay" onClick={onClose}>
            <div className="confirm-clear-cup-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                 <p className={`game-message ${status}`} aria-live="polite">{message || ' '}</p>
                 <div className="cups-container">
                    {cups.map(cup => (
                         <div
                            key={cup.id}
                            // Add showingConfirm phase class
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''} ${cup.isConfirmCup ? 'is-confirm' : ''}`}
                            // Apply horizontal slide based on order
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} // Adjust 110px if needed
                            onClick={() => handleCupClick(cup.id)}
                            role="button" tabIndex={phase === 'selecting' ? 0 : -1} aria-label={`Cup ${cup.id}`}
                            aria-hidden={phase === 'shuffling' || phase === 'initializing'}
                         >
                            {/* Cup visual includes graphic and revealed label */}
                            <div className="cup-visual">
    <div className={`cup-graphic ${cup.showConfirmInitially ? 'initially-revealed' : ''}`}>
        {/* Conditionally render checkmark OR your image */}
        {cup.showConfirmInitially
            ? '✔️' // Keep checkmark for initial reveal (or use another image)
            : <img src="/images/my-cool-cup.png" alt="Cup" /> // <<< UPDATE THIS PATH to your image
        }
    </div>
    {/* Revealed label positioned absolutely inside visual */}
    <div className="cup-label cup-label-revealed">
        {cup.isConfirmCup ? '✔️ Confirm' : '❌ Cancel'}
    </div>
</div>
                         </div>
                     ))}
                </div>
                 <button onClick={onClose} className="game-close-button" disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'showingConfirm' || phase === 'pre-shuffle'}>
                    Cancel Game
                 </button>
            </div>
        </div>
    );
};

export default ConfirmClearCupGame;