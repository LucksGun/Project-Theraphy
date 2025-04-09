// src/ConfirmClearCupGame.tsx - Added Initial Reveal Logic

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
    isRevealed: boolean; // Only true for the chosen cup AFTER selection
    isConfirmCup: boolean;
    // NEW: State to briefly show the confirm cup before shuffle
    showConfirmInitially: boolean;
}

// --- Constants ---
const INITIAL_REVEAL_MS = 1500; // How long to show the confirm cup location
const PRE_SHUFFLE_DELAY_MS = 300; // Short pause after hiding confirm cup before shuffle
const SHUFFLE_DURATION_MS = 2000;
const RESULT_DELAY_MS = 1500; // Delay after showing result before closing
const FAIL_DELAY_MS = 1500;

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };

// --- The Component ---
const ConfirmClearCupGame: React.FC<ConfirmClearCupGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [cups, setCups] = useState<CupState[]>([]);
    // Added 'showingConfirm' phase
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'showingConfirm' | 'pre-shuffle' | 'shuffling' | 'selecting' | 'revealing' | 'closing'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmCupId, setConfirmCupId] = useState<number | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const isMountedRef = useRef<boolean>(false);

    // --- Cleanup Timeouts ---
    const clearGameTimeouts = useCallback(() => { gameTimeoutsRef.current.forEach(clearTimeout); gameTimeoutsRef.current = []; }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearGameTimeouts();
        setMessage("Watch where the 'Confirm' cup goes...");
        setPhase('initializing');
        setStatus('playing');
        console.log("CupConfirm: Setting up game.");

        const winningCup = Math.floor(Math.random() * 3) + 1;
        setConfirmCupId(winningCup);
        console.log("CupConfirm: Winning cup is", winningCup);

        // Setup initial cup state - Mark which one to show initially
        const initialCups: CupState[] = [
            { id: 1, order: 0, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 1, showConfirmInitially: winningCup === 1 },
            { id: 2, order: 1, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 2, showConfirmInitially: winningCup === 2 },
            { id: 3, order: 2, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 3, showConfirmInitially: winningCup === 3 },
        ];
        setCups(initialCups);
        setPhase('showingConfirm'); // New phase to show the confirm cup

        // Timer to hide the confirm cup again
        const hideTimer = setTimeout(() => {
            if (!isMountedRef.current) return;
            console.log("CupConfirm: Hiding confirm cup location.");
            setCups(prevCups => prevCups.map(c => ({ ...c, showConfirmInitially: false }))); // Hide indicator
            setPhase('pre-shuffle'); // Short pause before shuffle

            // Timer to start shuffling
            const shuffleTimer = setTimeout(() => {
                if (!isMountedRef.current) return;
                setPhase('shuffling');
                setMessage("Shuffling...");
                console.log("CupConfirm: Starting shuffle.");
                const orders = shuffleArray([0, 1, 2]);
                setCups(prevCups => prevCups.map((cup, index) => ({
                    ...cup, order: orders[index], isRevealed: false, isChosen: false // Ensure reset
                })));

                // Timer to end shuffling
                const endShuffleTimer = setTimeout(() => {
                    if (!isMountedRef.current) return;
                    setPhase('selecting'); setMessage("Pick the 'Confirm' cup!");
                    console.log("CupConfirm: Shuffle complete. Waiting for selection.");
                }, SHUFFLE_DURATION_MS);
                gameTimeoutsRef.current.push(endShuffleTimer);

            }, PRE_SHUFFLE_DELAY_MS); // Start shuffle after short pause
            gameTimeoutsRef.current.push(shuffleTimer);

        }, INITIAL_REVEAL_MS); // How long to show the confirm cup
        gameTimeoutsRef.current.push(hideTimer);

    }, [clearGameTimeouts]);

    // --- Effect for setup/cleanup ---
    useEffect(() => {
         clearGameTimeouts();
         if (isOpen) {
             isMountedRef.current = true;
             console.log("CupConfirm: Opened.");
             setupGame();
             return () => { // Cleanup on close or unmount
                console.log("CupConfirm: Cleaning up."); isMountedRef.current = false; clearGameTimeouts(); setPhase('idle'); setCups([]); setMessage(null); setConfirmCupId(null); setStatus('playing');
             };
         } else { isMountedRef.current = false; }
    }, [isOpen, setupGame, clearGameTimeouts]); // Dependencies


    // --- Cup Click Handler --- (Logic remains largely the same)
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
                            aria-hidden={phase === 'shuffling'}
                         >
                            {/* Cup visual includes graphic and revealed label */}
                            <div className="cup-visual">
                                 {/* Show confirm symbol initially if it's the confirm cup and in showingConfirm phase */}
                                 <div className={`cup-graphic ${cup.showConfirmInitially ? 'initially-revealed' : ''}`}>
                                     {cup.showConfirmInitially ? '✔️' : '🥤'}
                                 </div>
                                 {/* Revealed label positioned absolutely inside visual */}
                                 <div className="cup-label cup-label-revealed">
                                     {cup.isConfirmCup ? '✔️ Confirm' : '❌ Cancel'}
                                 </div>
                            </div>
                         </div>
                     ))}
                </div>
                 <button onClick={onClose} className="game-close-button" disabled={phase === 'shuffling' || phase === 'revealing' || phase === 'showingConfirm'}>
                    Cancel Game
                 </button>
            </div>
        </div>
    );
};

export default ConfirmClearCupGame;