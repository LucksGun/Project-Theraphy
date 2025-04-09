// src/SelectPersonaTimingGame.tsx - Updated for Multi-Zone Selection

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './SelectPersonaTimingGame.css'; // Ensure CSS file exists
import { Persona, PersonaInfo, KeyValidationStatus, GeminiModel } from './App';

interface SelectPersonaTimingGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void;
    keyStatus: KeyValidationStatus;
    currentSelectedModel: GeminiModel;
    allPersonas: PersonaInfo[]; // Needs full info for labels/emojis
    restrictedModels: GeminiModel[];
}

// Represents a colored zone on the circle
interface Zone {
    start: number; // degrees 0-360
    end: number;   // degrees 0-360
    persona: Persona | null; // null indicates a "cancel" zone
    label: string; // Display label (Persona name or 'Cancel')
    color: string; // CSS color variable or hex code
}

// --- Constants ---
const DEGREES_PER_SEC = 220; // Slightly faster rotation
const INDICATOR_OFFSET_DEGREES = -90; // Pointing up at 0 degrees
// Zone Widths - Adjust as desired
const PERSONA_ZONE_WIDTH_DEGREES = 20; // Make persona zones reasonably large
const CANCEL_ZONE_MIN_WIDTH_DEGREES = 40; // Minimum width for red zones
// Delays
const SUCCESS_DELAY_MS = 1500;
const FAIL_DELAY_MS = 1500;

// --- Helper Functions ---
function isAngleInZone(angle: number, start: number, end: number): boolean { const normalizedAngle = (angle - start + 360) % 360; const normalizedEnd = (end - start + 360) % 360; return normalizedAngle <= normalizedEnd; }
// Add color mapping (customize these)
const personaColors: { [key in Persona]?: string } & { default: string } = {
    'university_master': 'var(--persona-color-uni, #4a90e2)', // Blue-ish
    'therapist': 'var(--persona-color-therapist, #50e3c2)', // Teal-ish
    'normal': 'var(--persona-color-normal, #b8e986)', // Green-ish
    'default': 'var(--persona-color-default, #f5a623)' // Orange for others
};
const cancelColor = 'var(--confirm-game-red, #dc3545)'; // Reuse red from clear game

// --- The Component ---
const SelectPersonaTimingGame: React.FC<SelectPersonaTimingGameProps> = ({
    isOpen, onClose, onPersonaSelected, keyStatus, currentSelectedModel, allPersonas, restrictedModels
}) => {
    const [currentAngle, setCurrentAngle] = useState(0);
    const [zones, setZones] = useState<Zone[]>([]); // Array of zones
    const [isMoving, setIsMoving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'playing' | 'success' | 'failed'>('playing');

    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const speedRef = useRef(DEGREES_PER_SEC);
    const isMountedRef = useRef<boolean>(false);
    const gameTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // Get available personas based on key status
    const availablePersonasForGame = useMemo(() => {
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

    // --- Cleanup Timeouts ---
    const clearGameTimeouts = useCallback(() => { gameTimeoutsRef.current.forEach(clearTimeout); gameTimeoutsRef.current = []; }, []);
    // --- Cleanup Animation ---
    const cleanupAnimation = useCallback(() => { if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } lastTimestampRef.current = null; setIsMoving(false); }, []);

    // --- Game Setup ---
    const setupGame = useCallback(() => {
        if (!isMountedRef.current) return;
        clearGameTimeouts();
        setStatus('playing');
        console.log(`TimingGame setup: Available personas: ${availablePersonasForGame.length}`);

        if (availablePersonasForGame.length === 0) {
            setMessage("No personas available with current key!"); setStatus('failed');
            const timer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS); gameTimeoutsRef.current.push(timer); return;
        }

        // --- Calculate Zones ---
        const numPersonas = availablePersonasForGame.length;
        const totalPersonaDegrees = numPersonas * PERSONA_ZONE_WIDTH_DEGREES;
        let remainingDegrees = 360 - totalPersonaDegrees;
        let cancelZoneWidth = CANCEL_ZONE_MIN_WIDTH_DEGREES;
        // Ensure cancel zones have minimum width, adjust persona zone width if necessary
        if (remainingDegrees < numPersonas * CANCEL_ZONE_MIN_WIDTH_DEGREES) {
             console.warn("Not enough space for minimum cancel zones, reducing persona zone width.");
             // This calculation might need refinement - for now, just split remaining space
             cancelZoneWidth = Math.max(5, remainingDegrees / numPersonas); // Ensure at least 5 degrees
             // Recalculate persona width based on available space minus minimum cancel zones
             // This part gets complex, maybe just stick to fixed persona width and variable cancel width for now?
             // Let's assume PERSONA_ZONE_WIDTH_DEGREES is achievable.
             if(remainingDegrees < 0) remainingDegrees = 0; // Cannot be negative
             cancelZoneWidth = remainingDegrees / numPersonas;
        } else {
            cancelZoneWidth = remainingDegrees / numPersonas;
        }

        const calculatedZones: Zone[] = [];
        let currentStartAngle = 0;
        availablePersonasForGame.forEach((personaInfo, index) => {
            // Add Persona Zone
            const personaEndAngle = (currentStartAngle + PERSONA_ZONE_WIDTH_DEGREES) % 360;
            calculatedZones.push({
                start: currentStartAngle,
                end: personaEndAngle,
                persona: personaInfo.value,
                label: personaInfo.label,
                color: personaColors[personaInfo.value] || personaColors.default
            });
            currentStartAngle = personaEndAngle;

             // Add Cancel Zone (unless it's the last one and total degrees make it zero)
             if (cancelZoneWidth > 0.1 || index < numPersonas -1) { // Add if width > 0.1 or not the last gap
                const cancelEndAngle = (currentStartAngle + cancelZoneWidth) % 360;
                calculatedZones.push({
                    start: currentStartAngle,
                    end: cancelEndAngle,
                    persona: null, // Indicate cancel zone
                    label: 'Cancel',
                    color: cancelColor
                });
                currentStartAngle = cancelEndAngle;
             }
        });
        setZones(calculatedZones);
        console.log("Calculated Zones:", calculatedZones);
        // --- End Calculate Zones ---

        setMessage("Stop on the Persona you want!");
        setCurrentAngle(Math.random() * 360);
        // Short delay before starting movement
        const startTimer = setTimeout(() => { if (isMountedRef.current) setIsMoving(true); }, 50);
        gameTimeoutsRef.current.push(startTimer);

    }, [availablePersonasForGame, cleanupAnimation, onClose]);


    // --- Animation Loop --- (Stable)
     const animate = useCallback((timestamp: number) => { /* ... (same as before) ... */ if (!isMountedRef.current) { lastTimestampRef.current = null; return; } if (!lastTimestampRef.current) { lastTimestampRef.current = timestamp; animationFrameRef.current = requestAnimationFrame(animate); return; } const deltaTime = (timestamp - lastTimestampRef.current) / 1000; lastTimestampRef.current = timestamp; const safeDeltaTime = Math.min(deltaTime, 0.1); if (safeDeltaTime <= 0) { animationFrameRef.current = requestAnimationFrame(animate); return; } const deltaAngle = speedRef.current * safeDeltaTime; setCurrentAngle(prevAngle => (prevAngle + deltaAngle) % 360); animationFrameRef.current = requestAnimationFrame(animate); }, []);


    // --- Effect to Start/Stop Animation Loop based on isMoving --- (Stable)
    useEffect(() => { if (isMoving) { if (!animationFrameRef.current) { console.log("TimingGame useEffect[isMoving=true]: Starting animation loop."); lastTimestampRef.current = null; animationFrameRef.current = requestAnimationFrame(animate); } } else { cleanupAnimation(); } return () => { if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } }; }, [isMoving, animate, cleanupAnimation]);


    // --- Effect to Setup/Cleanup Game on Open/Close --- (Stable)
    useEffect(() => { clearGameTimeouts(); if (isOpen) { isMountedRef.current = true; console.log("TimingGame useEffect[isOpen=true]: Component is visible. Initial setup."); setupGame(); return () => { console.log("TimingGame useEffect[cleanup]: Cleaning up on close/unmount."); isMountedRef.current = false; cleanupAnimation(); clearGameTimeouts(); setMessage(null); setStatus('playing'); setZones([]); }; } else { isMountedRef.current = false; } }, [isOpen, setupGame, cleanupAnimation, clearGameTimeouts]);


    // --- Handle Stop Button Click ---
    const handleStop = () => {
        if (!isMoving) return;
        setIsMoving(false); // Stop animation

        const stoppedAngle = currentAngle;
        console.log(`Stopped at: ${stoppedAngle.toFixed(1)}°`);

        // Find which zone the angle landed in
        const landedZone = zones.find(zone => isAngleInZone(stoppedAngle, zone.start, zone.end));

        if (landedZone && landedZone.persona !== null) {
            // SUCCESS (Hit Persona Zone) -> Check model conflict
            const selectedPersonaValue = landedZone.persona;
            const isModelRestricted = restrictedModels.includes(currentSelectedModel);
            const hasValidKey = keyStatus.isValid === true;

            if (isModelRestricted && !hasValidKey) {
                 // CONFLICT!
                console.log(`Conflict: Model '${currentSelectedModel}' restricted, key invalid.`);
                setStatus('failed'); setMessage(`Success, but Model '${currentSelectedModel}' needs key for Persona '${landedZone.label}'! Change model/key.`);
                 const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
                 gameTimeoutsRef.current.push(failTimer);
            } else {
                // NO CONFLICT - True Success!
                console.log("Success! No model conflict.");
                setStatus('success'); setMessage(`Selected: ${landedZone.label}!`);
                const successTimer = setTimeout(() => { if (isMountedRef.current) { onPersonaSelected(selectedPersonaValue); onClose(); } }, SUCCESS_DELAY_MS);
                gameTimeoutsRef.current.push(successTimer);
            }
        } else {
            // FAILURE (Hit Red/Cancel Zone or somehow missed all zones)
            console.log("Failed! Hit cancel zone or missed.");
            setStatus('failed');
            setMessage(landedZone ? 'Cancelled Selection.' : 'Missed! Please try again.'); // Different message if they hit red vs glitch
            const failTimer = setTimeout(() => { if (isMountedRef.current) onClose(); }, FAIL_DELAY_MS);
            gameTimeoutsRef.current.push(failTimer);
        }
    };

    // --- Generate Conic Gradient Style based on calculated zones ---
    const getConicGradientStyle = () => {
        if (zones.length === 0) return 'var(--button-secondary-bg)'; // Fallback if zones not ready

        const gradientStops = zones.map(zone => `${zone.color} ${zone.start}deg ${zone.end}deg`);
        // Need to handle potential gap if sum != 360 due to rounding, maybe fill last gap with red?
        // Or ensure calculation results in contiguous zones summing to 360.
        // The current calculation should be contiguous.

        return `conic-gradient(${gradientStops.join(', ')})`;
    };


    // Render null if not open
    if (!isOpen) return null;

    // --- Render Logic ---
    return (
         <div className="clear-confirm-overlay" onClick={onClose}>
            <div className="select-persona-timing-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Select Persona!</h4>
                {/* Removed target persona display */}
                <p className={`game-message ${status}`}>{message || ' '}</p>
                <div className="timing-circle-container">
                    <div className="timing-circle" style={{ background: getConicGradientStyle() }} >
                        {/* Optional: Render persona emojis/labels statically on the circle border */}
                        {zones.map(zone => zone.persona && (
                            <div key={zone.persona} className="persona-zone-label" style={{transform: `rotate(${zone.start + (PERSONA_ZONE_WIDTH_DEGREES/2) + INDICATOR_OFFSET_DEGREES}deg) translate(70px)`}}>
                               {allPersonas.find(p => p.value === zone.persona)?.emoji}
                           </div>
                        ))}
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