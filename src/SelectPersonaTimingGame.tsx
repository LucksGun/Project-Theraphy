// src/SelectPersonaTimingGame.tsx - Timing Circle Game for Persona Selection

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './SelectPersonaTimingGame.css'; // Renamed CSS import
// Import necessary types from App.tsx
import { Persona, PersonaInfo, KeyValidationStatus, GeminiModel } from './App';

interface SelectPersonaTimingGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void; // Callback for success
    keyStatus: KeyValidationStatus;              // Needed for model check
    currentSelectedModel: GeminiModel;           // Needed for model check
    allPersonas: PersonaInfo[];                 // List of all possible personas
    restrictedModels: GeminiModel[];            // List of restricted models
}

// --- Game Constants ---
const TARGET_ZONE_WIDTH_DEGREES = 30;
const DEGREES_PER_SEC = 180; // Speed
const INDICATOR_OFFSET_DEGREES = -90;
const SUCCESS_DELAY_MS = 1500; // Delay after showing success message
const FAIL_DELAY_MS = 1500; // Delay after showing failure/conflict message

// --- Helper Function ---
// Checks if angle is within the target zone (handles wrap-around)
function isAngleInZone(angle: number, start: number, end: number): boolean {
    const normalizedAngle = (angle - start + 360) % 360;
    const normalizedEnd = (end - start + 360) % 360;
    return normalizedAngle <= normalizedEnd;
}
// Fisher-Yates Shuffle (if needed for picking persona, good practice)
const shuffleArray = <T,>(array: T[]): T[] => { let currentIndex = array.length, randomIndex; const newArray = [...array]; while (currentIndex !== 0) { randomIndex = Math.floor(Math.random() * currentIndex); currentIndex--; [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]]; } return newArray; };


// --- The Component ---
const SelectPersonaTimingGame: React.FC<SelectPersonaTimingGameProps> = ({
    isOpen, onClose, onPersonaSelected, keyStatus, currentSelectedModel, allPersonas, restrictedModels
}) => {
    const [currentAngle, setCurrentAngle] = useState(0);
    const [targetZone, setTargetZone] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');
    const [targetPersonaInfo, setTargetPersonaInfo] = useState<PersonaInfo | null>(null); // Persona for this round

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC);
    const isMountedRef = useRef<boolean>(false);
    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // Determine available personas based on keyStatus passed from App
    const availablePersonasForGame = useMemo(() => {
        console.log("TimingGame: Calculating available personas. Key Valid:", keyStatus.isValid);
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

    // --- Animation Loop ---
    const animate = useCallback((timestamp: number) => {
        if (!isMountedRef.current) { lastTimestampRef.current = null; return; }
        if (!lastTimestampRef.current) { lastTimestampRef.current = timestamp; animationFrameRef.current = requestAnimationFrame(animate); return; }
        const deltaTime = (timestamp - lastTimestampRef.current) / 1000; lastTimestampRef.current = timestamp; const safeDeltaTime = Math.min(deltaTime, 0.1);
        if (safeDeltaTime <= 0) { animationFrameRef.current = requestAnimationFrame(animate); return; }
        const deltaAngle = speedRef.current * safeDeltaTime;
        setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360);
        animationFrameRef.current = requestAnimationFrame(animate);
    }, []); // Stable

    // --- Cleanup Animation ---
    const cleanupAnimation = useCallback(() => { console.log("TimingGame cleanupAnimation: Cancelling frame."); if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } lastTimestampRef.current = null; setIsMoving(false); }, []);
    // --- Clear Game Timeouts ---
    const clearGameTimeouts = useCallback(() => { console.log(`TimingGame: Clearing ${gameTimeoutsRef.current.length} game timeouts.`); gameTimeoutsRef.current.forEach(clearTimeout); gameTimeoutsRef.current = []; }, []);

    // --- Game Setup / Round Start ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearGameTimeouts(); // Clear previous timers
        setStatus('playing');
        console.log(`TimingGame setup: Available personas: ${availablePersonasForGame.length}`);

        if (availablePersonasForGame.length === 0) {
             setMessage("No personas available with current key!");
             setStatus('failed');
             const closeTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
             gameTimeoutsRef.current.push(closeTimer);
             return;
        }
        // Pick one random available persona
        const randomPersona = shuffleArray(availablePersonasForGame)[0];
        setTargetPersonaInfo(randomPersona);
        setMessage(`Stop in Green Zone for ${randomPersona.label}!`);

        const randomStartAngle = Math.random() * 360;
        const endAngle = (randomStartAngle + TARGET_ZONE_WIDTH_DEGREES) % 360;
        setTargetZone({ start: randomStartAngle, end: endAngle });
        setCurrentAngle(Math.random() * 360); // Random start angle

        // Short delay before moving
        const startTimer = setTimeout(() => {
             if (isMountedRef.current) setIsMoving(true);
        }, 50);
        gameTimeoutsRef.current.push(startTimer);
        console.log(`TimingGame setup complete. Target Persona: ${randomPersona.value}. Target Zone: ${randomStartAngle.toFixed(1)}°-${endAngle.toFixed(1)}°.`);

    }, [availablePersonasForGame, cleanupAnimation, onClose]); // Stable dependencies

    // --- Effect to Start/Stop Animation Loop based on isMoving ---
    useEffect(() => { if (isMoving) { if (!animationFrameRef.current) { console.log("TimingGame useEffect[isMoving=true]: Starting animation loop."); lastTimestampRef.current = null; animationFrameRef.current = requestAnimationFrame(animate); } } else { cleanupAnimation(); } return () => { if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } }; }, [isMoving, animate, cleanupAnimation]);

    // --- Effect to Setup/Cleanup Game on Open/Close ---
    useEffect(() => { clearGameTimeouts(); if (isOpen) { isMountedRef.current = true; console.log("TimingGame useEffect[isOpen=true]: Component is visible. Initial setup."); setupGame(); return () => { console.log("TimingGame useEffect[cleanup]: Cleaning up on close/unmount."); isMountedRef.current = false; cleanupAnimation(); clearGameTimeouts(); setMessage(null); setStatus('playing'); setTargetPersonaInfo(null); }; } else { isMountedRef.current = false; } }, [isOpen, setupGame, cleanupAnimation, clearGameTimeouts]);


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving || !targetPersonaInfo) return;
        setIsMoving(false); // Request stop

        const stoppedAngle = currentAngle;
        console.log(`TimingGame Stopped at: ${stoppedAngle.toFixed(1)}°`);

        if (isAngleInZone(stoppedAngle, targetZone.start, targetZone.end)) {
            // SUCCESS -> Check model conflict
            const selectedPersonaValue = targetPersonaInfo.value;
            const isModelRestricted = restrictedModels.includes(currentSelectedModel);
            const hasValidKey = keyStatus.isValid === true;

            if (isModelRestricted && !hasValidKey) {
                 // CONFLICT!
                console.log(`TimingGame Conflict: Model '${currentSelectedModel}' restricted, key invalid.`);
                setStatus('failed'); setMessage(`Success, but Model '${currentSelectedModel}' needs key for Persona '${targetPersonaInfo.label}'! Change model/key.`);
                 const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
                 gameTimeoutsRef.current.push(failTimer);
            } else {
                // NO CONFLICT - True Success!
                console.log("TimingGame Success! No model conflict.");
                setStatus('success'); setMessage(`Selected: ${targetPersonaInfo.label}!`);
                const successTimer = setTimeout(() => { if (isMountedRef.current) { onPersonaSelected(selectedPersonaValue); onClose(); } }, SUCCESS_DELAY_MS);
                gameTimeoutsRef.current.push(successTimer);
            }
        } else {
            // FAILURE (Missed Zone)
            console.log("TimingGame Failed! Missed green zone.");
            setStatus('failed'); setMessage('Missed! Please try again.');
            const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
            gameTimeoutsRef.current.push(failTimer);
        }
    };

    // --- Generate Conic Gradient Style ---
    const getConicGradientStyle = () => { const { start, end } = targetZone; const redColor = 'var(--confirm-game-red, #dc3545)'; const greenColor = 'var(--confirm-game-green, #198754)'; if (start <= end) { return `conic-gradient(${redColor} 0deg ${start}deg, ${greenColor} ${start}deg ${end}deg, ${redColor} ${end}deg 360deg)`; } else { return `conic-gradient(${greenColor} 0deg ${end}deg, ${redColor} ${end}deg ${start}deg, ${greenColor} ${start}deg 360deg)`; } };

    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return (
         <div className="clear-confirm-overlay" onClick={onClose}> {/* Reuse overlay style */}
            <div className="select-persona-timing-modal" onClick={(e) => e.stopPropagation()}> {/* Specific class for modal */}
                <h4>Select Persona!</h4>
                {/* Display target persona for clarity */}
                {targetPersonaInfo && status === 'playing' && (
                    <p className="target-persona-display">
                        Target: {targetPersonaInfo.emoji} {targetPersonaInfo.label}
                    </p>
                )}
                <p className={`game-message ${status}`}>{message || ' '}</p>
                <div className="timing-circle-container">
                    <div className="timing-circle" style={{ background: getConicGradientStyle() }} >
                        <div className="timing-indicator-arm" style={{ transform: `rotate(${currentAngle + INDICATOR_OFFSET_DEGREES}deg)` }} >
                            <div className="timing-indicator-dot"></div>
                        </div>
                    </div>
                </div>
                <button onClick={handleStop} className="stop-button" disabled={!isMoving || status !== 'playing'} > STOP </button>
                <button onClick={onClose} className="cancel-button" disabled={status === 'success' || status === 'failed'} > Cancel </button>
            </div>
        </div>
    );
};

export default SelectPersonaTimingGame;