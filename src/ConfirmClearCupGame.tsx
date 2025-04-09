// src/ConfirmClearCupGame.tsx - Shuffling Cups for Clear Chat Confirmation (FINAL)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ConfirmClearCupGame.css'; // Make sure CSS file exists and is correctly named/imported

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
    isRevealed: boolean;
    isConfirmCup: boolean; // Is this the correct cup?
}

// --- Constants ---
const SHOW_DELAY_MS = 1000; // Shorter delay before shuffle
const SHUFFLE_DURATION_MS = 2000; // Duration of shuffle animation
const REVEAL_DELAY_MS = 1500; // Delay after revealing result before closing
const FAIL_DELAY_MS = 1500; // Delay after picking wrong cup

// --- Helper: Fisher-Yates Shuffle ---
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };

// --- The Component ---
const ConfirmClearCupGame: React.FC<ConfirmClearCupGameProps> = ({ isOpen, onClose, onConfirm }) => {
    const [cups, setCups] = useState<CupState[]>([]);
    const [phase, setPhase] = useState<'idle' | 'initializing' | 'pre-shuffle' | 'shuffling' | 'selecting' | 'revealing' | 'closing'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmCupId, setConfirmCupId] = useState<number | null>(null); // Which cup ID is correct?
    // *** ADDED Missing Status State ***
    const [,setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const shuffleTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const isMountedRef = useRef<boolean>(false);

    // --- Cleanup Timeouts ---
    const clearShuffleTimeouts = useCallback(() => {
        console.log(`Clearing ${shuffleTimeoutsRef.current.length} cup game timeouts.`);
        shuffleTimeoutsRef.current.forEach(clearTimeout);
        shuffleTimeoutsRef.current = [];
    }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearShuffleTimeouts();
        setMessage("Find the 'Confirm' cup...");
        setPhase('initializing');
        setStatus('playing'); // Reset status
        console.log("CupConfirm: Setting up game.");

        const winningCup = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
        setConfirmCupId(winningCup);
        console.log("CupConfirm: Winning cup is", winningCup);

        const initialCups: CupState[] = [
            { id: 1, order: 0, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 1 },
            { id: 2, order: 1, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 2 },
            { id: 3, order: 2, isChosen: false, isRevealed: false, isConfirmCup: winningCup === 3 },
        ];
        setCups(initialCups);
        setPhase('pre-shuffle');

        const shuffleTimer = setTimeout(() => {
            if (!isMountedRef.current) return;
            setPhase('shuffling');
            setMessage("Shuffling...");
            const orders = shuffleArray([0, 1, 2]);
            setCups(prevCups => prevCups.map((cup, index) => ({
                ...cup, order: orders[index], isRevealed: false, isChosen: false
            })));
            const endShuffleTimer = setTimeout(() => {
                if (!isMountedRef.current) return;
                setPhase('selecting'); setMessage("Pick the 'Confirm' cup!");
            }, SHUFFLE_DURATION_MS);
            shuffleTimeoutsRef.current.push(endShuffleTimer);
        }, SHOW_DELAY_MS);
        shuffleTimeoutsRef.current.push(shuffleTimer);

    }, [clearShuffleTimeouts]); // Dependencies

    // --- Effect for setup/cleanup ---
    useEffect(() => {
         clearShuffleTimeouts();
         if (isOpen) {
             isMountedRef.current = true;
             console.log("CupConfirm: Opened.");
             setupGame(); // Initial setup
             return () => { // Cleanup on close or unmount
                console.log("CupConfirm: Cleaning up.");
                isMountedRef.current = false;
                clearShuffleTimeouts();
                // Reset state fully
                setPhase('idle'); setCups([]); setMessage(null); setConfirmCupId(null); setStatus('playing');
             };
         } else {
             isMountedRef.current = false; // Ensure flag is false if closed externally
         }
    }, [isOpen, setupGame, clearShuffleTimeouts]); // Depend on stable callbacks and isOpen


    // --- Cup Click Handler ---
    const handleCupClick = (cupId: number) => {
        if (phase !== 'selecting' || !isMountedRef.current) return;
        console.log(`Cup ${cupId} chosen.`);
        setPhase('revealing');
        setCups(prevCups => prevCups.map(c => ({ ...c, isChosen: c.id === cupId, isRevealed: true })));

        if (cupId === confirmCupId) {
            // SUCCESS
            console.log("CupConfirm: Correct cup!");
            setStatus('success'); // Use the setter function
            setMessage('Confirmed! Clearing chat...');
            const successTimer = setTimeout(() => { if (isMountedRef.current) { onConfirm(); onClose(); } }, REVEAL_DELAY_MS);
            shuffleTimeoutsRef.current.push(successTimer);
        } else {
            // FAILURE
            console.log("CupConfirm: Wrong cup!");
            setStatus('failed'); // Use the setter function
            setMessage('Oops! Wrong cup. Action cancelled.');
             const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
             shuffleTimeoutsRef.current.push(failTimer);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="persona-cup-game-overlay" onClick={onClose}> {/* Can reuse overlay style name */}
             {/* Use specific class for modal styling if needed */}
            <div className="confirm-clear-cup-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Confirm Clear Chat</h4>
                 <p className="game-message" aria-live="polite">{message || ' '}</p>
                 <div className="cups-container">
                    {cups.map(cup => (
                         <div
                            key={cup.id}
                            className={`cup cup-order-${cup.order} ${phase} ${cup.isRevealed ? 'revealed' : ''} ${cup.isChosen ? 'chosen' : ''}`}
                            style={{ transform: `translateX(${(cup.order - 1) * 110}px)` }} // Adjust 110px based on your CSS for gap/width
                            onClick={() => handleCupClick(cup.id)}
                            role="button" tabIndex={phase === 'selecting' ? 0 : -1} aria-label={`Cup ${cup.id}`}
                            aria-hidden={phase === 'shuffling'}
                         >
                            <div className="cup-graphic">🥤</div>
                            {cup.isRevealed && (
                                <div className="cup-label cup-label-revealed">
                                    {cup.isConfirmCup ? '✔️ Confirm' : '❌ Cancel'}
                                </div>
                             )}
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