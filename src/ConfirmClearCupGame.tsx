// src/ConfirmClearCupGame.tsx - Updated Reveal & Logic

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ConfirmClearCupGame.css'; // Ensure CSS file exists and is correctly named/imported

// --- Component Props ---
interface ConfirmClearCupGameProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

// --- Internal State for each Cup ---
interface CupState {
    id: number;
    order: number; // Visual position
    isChosen: boolean;
    isRevealed: boolean; // Will only be true for the chosen cup
    isConfirmCup: boolean; // Is this the correct cup?
}

// --- Constants ---
const SHOW_DELAY_MS = 1000;
const SHUFFLE_DURATION_MS = 2000; // Duration of shuffle animation (CSS transition)
const RESULT_DELAY_MS = 1500;
const FAIL_DELAY_MS = 1500;    // Delay after showing result before closing

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };

// --- The Component ---
const ConfirmClearCupGame: React.FC<ConfirmClearCupGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [cups, setCups] = useState<CupState[]>([]);
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'pre-shuffle' | 'shuffling' | 'selecting' | 'revealing' | 'closing'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmCupId, setConfirmCupId] = useState<number | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing'); // Keep status for message styling

    const shuffleTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const isMountedRef = useRef<boolean>(false);

    // --- Cleanup Timeouts ---
    const clearShuffleTimeouts = useCallback(() => { shuffleTimeoutsRef.current.forEach(clearTimeout); shuffleTimeoutsRef.current = []; }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearShuffleTimeouts();
        setMessage("Find the 'Confirm' cup...");
        setPhase('initializing');
        setStatus('playing');
        console.log("CupConfirm: Setting up game.");

        const winningCup = Math.floor(Math.random() * 3) + 1;
        setConfirmCupId(winningCup);
        console.log("CupConfirm: Winning cup is", winningCup);

        const initialCups: CupState[] = [
            { id: 1, order: 0, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 1 },
            { id: 2, order: 1, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 2 },
            { id: 3, order: 2, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 3 },
        ];
        setCups(initialCups);
        setPhase('pre-shuffle'); // Initial state with cups visible but not revealed

        // Start shuffling timer
        const shuffleTimer = setTimeout(() => {
            if (!isMountedRef.current) return;
            setPhase('shuffling');
            setMessage("Shuffling...");
            const orders = shuffleArray([0, 1, 2]);
            // Update order - CSS transition handles the visual "slide"
            setCups(prevCups => prevCups.map((cup, index) => ({
                ...cup, order: orders[index], isRevealed: false, isChosen: false
            })));

            // End shuffling timer
            const endShuffleTimer = setTimeout(() => {
                if (!isMountedRef.current) return;
                setPhase('selecting'); setMessage("Pick the 'Confirm' cup!");
            }, SHUFFLE_DURATION_MS); // Wait for CSS transition to finish
            shuffleTimeoutsRef.current.push(endShuffleTimer);

        }, SHOW_DELAY_MS);
        shuffleTimeoutsRef.current.push(shuffleTimer);

    }, [clearShuffleTimeouts]);

    // --- Effect for setup/cleanup ---
    useEffect(() => {
         clearShuffleTimeouts();
         if (isOpen) {
             isMountedRef.current = true;
             console.log("CupConfirm: Opened.");
             setupGame();
             return () => { // Cleanup
                console.log("CupConfirm: Cleaning up."); isMountedRef.current = false; clearShuffleTimeouts(); setPhase('idle'); setCups([]); setMessage(null); setConfirmCupId(null); setStatus('playing');
             };
         } else { isMountedRef.current = false; }
    }, [isOpen, setupGame, clearShuffleTimeouts]);


    // --- Cup Click Handler ---
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting' || !isMountedRef.current) return;
        console.log(`Cup ${cupId} chosen.`);
        setPhase('revealing');
        // *** CHANGE: Only set chosen/revealed for the clicked cup ***
        setCups(prevCups => prevCups.map(c => ({
            ...c,
            isChosen: c.id === cupId,
            isRevealed: c.id === cupId // Only chosen cup is revealed
        })));

        const wasCorrect = cupId === confirmCupId;

        if (wasCorrect) {
            setStatus('success'); setMessage('Confirmed! Clearing chat...');
            const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, RESULT_DELAY_MS);
            shuffleTimeoutsRef.current.push(successTimer);
        } else {
            setStatus('failed'); setMessage('Oops! Wrong cup. Action cancelled.');
             const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
             shuffleTimeoutsRef.current.push(failTimer);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="persona-cup-game-overlay" onClick={onClose}>
            <div className="confirm-clear-cup-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                 <p className={`game-message ${status}`} aria-live="polite">{message || ' '}</p>
                 <div className="cups-container">
                    {cups.map(cup => (
                         <div
                            key={cup.id}
                            // Add isConfirmCup class ONLY when revealed for potential styling
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''} ${cup.isRevealed && cup.isConfirmCup ? 'is-confirm' : ''}`}
                            // Apply horizontal slide based on order
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} // Adjust 110px if needed
                            onClick={() => handleCupClick(cup.id)}
                            role="button" tabIndex={phase === 'selecting' ? 0 : -1} aria-label={`Cup ${cup.id}`}
                            aria-hidden={phase === 'shuffling'}
                         >
                            {/* Cup visual includes graphic and revealed label */}
                            <div className="cup-visual">
                                 <div className="cup-graphic">🥤</div>
                                 {/* Revealed label positioned absolutely inside visual */}
                                 <div className="cup-label cup-label-revealed">
                                     {cup.isConfirmCup ? '✔️ Confirm' : '❌ Cancel'}
                                 </div>
                            </div>
                         </div>
                     ))}
                </div>
                 <button onClick={onClose} className="game-close-button" disabled={phase === 'shuffling' || phase === 'revealing'}>
                    Cancel Game
                 </button>
            </div>
        </div>
    );
};

export default ConfirmClearCupGame;