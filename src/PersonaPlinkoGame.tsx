// src/PersonaPlinkoGame.tsx - Physics Plinko for Persona Selection

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Matter from 'matter-js';
import './PersonaPlinkoGame.css'; // Renamed CSS import
import { Persona, PersonaInfo, KeyValidationStatus } from './App'; // Import necessary types

interface PersonaPlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void; // Callback for success
    keyStatus: KeyValidationStatus;              // Needed for filtering personas
    allPersonas: PersonaInfo[];                 // Full list of personas with details
}

// --- Constants ---
const BOARD_WIDTH = 300;
const BOARD_HEIGHT = 400;
const PIN_RADIUS = 4;
const PIN_COLOR = '#888888';
const DARK_PIN_COLOR = '#AAAAAA';
const BALL_RADIUS = 7;
const BALL_COLOR = '#ff4500'; // Keeping ball color distinct
const WALL_THICKNESS = 40;
const ZONE_HEIGHT = 40;     // Height of the bottom detection zones
const GRAVITY = 0.8;
const BALL_RESTITUTION = 0.3;
const PIN_FRICTION = 0.05;
const SETTLE_VELOCITY_THRESHOLD = 0.2;
const SETTLE_CHECK_INTERVAL = 300;
const CLOSE_DELAY_MS = 2000; // Show result for 2 seconds

// --- Pin Layout (Use the denser one) ---
const pinLayout = [ { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.15 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.25 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.25 }, { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.35 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.35 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.35 }, { x: BOARD_WIDTH * 0.20, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.80, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.10, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.90, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.20, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.80, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.75 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.75 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.75 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.85 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.85 }, ];


// --- The Component ---
const PersonaPlinkoGame: React.FC<PersonaPlinkoGameProps> = ({
    isOpen, onClose, onPersonaSelected, keyStatus, allPersonas
}) => {
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const renderRef = useRef<Matter.Render | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);
    const ballRef = useRef<Matter.Body | null>(null);
    const settleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Store zone boundaries along with persona info
    const zonesRef = useRef<{ startX: number; endX: number; personaInfo: PersonaInfo }[]>([]);

    const [message, setMessage] = useState<string | null>("Get ready...");
    const [outcome, setOutcome] = useState<Persona | null>(null); // Store the selected Persona value

    // Determine available personas based on key status
    const availablePersonas = useMemo(() => {
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

    // --- Cleanup Function ---
    const cleanupMatter = useCallback(() => {
        console.log("PersonaPlinko: Cleaning up Matter.js");
        if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
        settleCheckIntervalRef.current = null;
        if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
        if (renderRef.current) Matter.Render.stop(renderRef.current);
        if (engineRef.current) Matter.World.clear(engineRef.current.world, false);
        if (engineRef.current) Matter.Engine.clear(engineRef.current);
        if (renderRef.current) renderRef.current.canvas.remove();
        engineRef.current = null; renderRef.current = null; runnerRef.current = null; ballRef.current = null; zonesRef.current = [];
    }, []);

    // --- Setup Matter.js ---
    useEffect(() => {
        if (isOpen && sceneRef.current && !engineRef.current) {
            console.log("PersonaPlinko: Setting up Matter.js...");
            setMessage("Dropping ball...");
            setOutcome(null);

             if (availablePersonas.length === 0) {
                console.warn("PersonaPlinko: No available personas to play with!");
                setMessage("No personas available with current key!");
                setTimeout(onClose, CLOSE_DELAY_MS);
                return;
            }

            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDarkMode ? '#242424' : '#ffffff';
            const pinColor = isDarkMode ? DARK_PIN_COLOR : PIN_COLOR;
            const wallColor = isDarkMode ? '#404040' : '#cccccc';

            const engine = Matter.Engine.create({ gravity: { y: GRAVITY } });
            const render = Matter.Render.create({ element: sceneRef.current, engine: engine, options: { width: BOARD_WIDTH, height: BOARD_HEIGHT, wireframes: false, background: bgColor, pixelRatio: window.devicePixelRatio || 1 } });
            engineRef.current = engine;
            renderRef.current = render;

            // --- Create Static Bodies ---
            const staticBodies: Matter.Body[] = [
                // Walls
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, -WALL_THICKNESS / 2, BOARD_WIDTH, WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }),
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + WALL_THICKNESS / 2, BOARD_WIDTH, WALL_THICKNESS, { isStatic: true, label: 'floor', render: { fillStyle: wallColor } }),
                Matter.Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: wallColor } }),
                Matter.Bodies.rectangle(BOARD_WIDTH + WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: wallColor } }),
                // Pins
                ...pinLayout.map(pin => Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, { isStatic: true, label: 'pin', friction: PIN_FRICTION, restitution: 0.5, render: { fillStyle: pinColor } }))
            ];

            // --- Create Persona Zones at Bottom ---
            const numZones = availablePersonas.length;
            const zoneWidth = BOARD_WIDTH / numZones;
            zonesRef.current = []; // Reset zones ref

            for (let i = 0; i < numZones; i++) {
                const personaInfo = availablePersonas[i];
                const startX = i * zoneWidth;
                const endX = (i + 1) * zoneWidth;

                // Add thin visual dividers (optional)
                 if (i > 0) {
                    staticBodies.push(Matter.Bodies.rectangle(startX, BOARD_HEIGHT - (ZONE_HEIGHT / 2), 2, ZONE_HEIGHT, { isStatic: true, isSensor: true, render: { fillStyle: wallColor } }));
                 }

                 // Store zone boundaries and persona info
                 zonesRef.current.push({ startX, endX, personaInfo });
                 console.log(`Created zone for ${personaInfo.value}: ${startX.toFixed(0)} to ${endX.toFixed(0)}`);
            }
            // --- End Create Zones ---

            // Ball
            const startX = BOARD_WIDTH / 2 + (Math.random() * 20 - 10);
            const ball = Matter.Bodies.circle(startX, BALL_RADIUS + 5, BALL_RADIUS, { restitution: BALL_RESTITUTION, friction: 0.01, label: 'ball', render: { fillStyle: BALL_COLOR } });
            ballRef.current = ball;

            Matter.World.add(engine.world, [...staticBodies, ball]); // Add all bodies

            // Run simulation
            const runner = Matter.Runner.create(); runnerRef.current = runner; Matter.Runner.run(runner, engine); Matter.Render.run(render);

             // --- Outcome Detection Interval ---
             if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
            settleCheckIntervalRef.current = setInterval(() => {
                const currentBall = ballRef.current;
                // Check if still open, ball exists, and outcome not yet decided
                if (!isOpen || !currentBall || !engineRef.current || outcome !== null) return;

                if ( currentBall.position.y > BOARD_HEIGHT - ZONE_HEIGHT && Matter.Body.getSpeed(currentBall) < SETTLE_VELOCITY_THRESHOLD ) {
                    const finalX = currentBall.position.x;
                    console.log(`PersonaPlinko: Ball settled at x: ${finalX.toFixed(1)}`);

                    // Find which zone it landed in
                    const landedZone = zonesRef.current.find(zone => finalX >= zone.startX && finalX < zone.endX);

                    if (landedZone) {
                         setOutcome(landedZone.personaInfo.value); // Set final outcome state
                         setMessage(`Landed on ${landedZone.personaInfo.label}!`);
                         console.log("PersonaPlinko Success! Selected:", landedZone.personaInfo.value);
                         onPersonaSelected(landedZone.personaInfo.value); // Call callback immediately
                    } else {
                        // Should ideally not happen if zones cover the bottom
                        console.warn("PersonaPlinko: Ball settled outside defined zones?");
                        setMessage("Ball landed out of bounds! Try again.");
                        setOutcome(null); // Indicate failure? Or just close?
                    }

                    // Stop simulation and rendering after outcome
                    cleanupMatter(); // Stop and clean up

                    // Close modal after delay
                    setTimeout(onClose, CLOSE_DELAY_MS);
                }
            }, SETTLE_CHECK_INTERVAL);
        }

        // Cleanup function
        return () => {
             if (isOpen) { // Prevent cleanup if already closed
                 cleanupMatter();
             }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]); // Run only when isOpen changes

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="persona-plinko-overlay" onClick={onClose}> {/* Renamed class */}
            <div className="persona-plinko-modal" onClick={(e) => e.stopPropagation()}> {/* Renamed class */}
                <h4>Select Persona!</h4>

                {/* Container where Matter.js will render its canvas */}
                <div ref={sceneRef} className="plinko-canvas-container">
                    {/* Static Labels positioned behind/around canvas */}
                    {/* Dynamically create labels based on zonesRef */}
                    {zonesRef.current.map(zone => (
                        <div
                           key={zone.personaInfo.value}
                           className="plinko-label"
                           // Calculate center X for label positioning
                           style={{ left: `${((zone.startX + zone.endX) / 2 / BOARD_WIDTH) * 100}%` }}
                        >
                            {zone.personaInfo.emoji} {/* Show emoji as label */}
                        </div>
                    ))}
                </div>

                <p className="plinko-message" aria-live="polite">
                    {message || ' '}
                </p>

                <button onClick={onClose} className="plinko-button cancel">
                    {outcome ? "Close" : "Cancel Game"}
                </button>
            </div>
        </div>
    );
};

export default PersonaPlinkoGame; // Renamed export