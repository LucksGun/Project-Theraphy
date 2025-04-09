// src/PersonaPlinkoGame.tsx - Physics Plinko for Persona Selection

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Matter from 'matter-js';
import './PersonaPlinkoGame.css'; // Renamed CSS import
import { Persona, PersonaInfo, KeyValidationStatus } from './App'; // Import necessary types

interface PersonaPlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void; // Callback for success
    keyStatus: KeyValidationStatus;               // Needed for filtering personas
    allPersonas: PersonaInfo[];                   // Full list of personas with details
}

// --- Constants (MODIFIED) ---
const BOARD_WIDTH = 500; // Increased width
const BOARD_HEIGHT = 650; // Increased height
const PIN_RADIUS = 5;    // Slightly larger pins
const PIN_COLOR = '#888888';
const DARK_PIN_COLOR = '#AAAAAA';
const BALL_RADIUS = 9;     // Slightly larger ball
const BALL_COLOR = '#ff4500';
const WALL_THICKNESS = 50; // Slightly thicker walls to match scale
const ZONE_HEIGHT = 50;    // Increased zone height slightly
const GRAVITY = 0.7;       // Slightly lower gravity for slower fall
const BALL_RESTITUTION = 0.35; // Slightly more bounce
const PIN_FRICTION = 0.05;
const SETTLE_VELOCITY_THRESHOLD = 0.2;
const SETTLE_CHECK_INTERVAL = 300;
const CLOSE_DELAY_MS = 3000; // Increased delay to see result

// --- Pin Layout (NEW - More pins for larger board) ---
// We need a more extensive layout for the bigger board.
// Generating this programmatically could be complex, so here's a denser static example.
// You might want to refine this pattern further.
const pinLayout: { x: number; y: number; }[] = [];
const rows = 12; // More rows of pins
const firstRowY = BOARD_HEIGHT * 0.12;
const lastRowY = BOARD_HEIGHT * 0.88; // Pins go lower down

for (let i = 0; i < rows; i++) {
    const y = firstRowY + (i / (rows - 1)) * (lastRowY - firstRowY);
    const isOffsetRow = i % 2 !== 0; // Offset every other row
    const pinsInRow = isOffsetRow ? 8 : 9; // Vary pins per row slightly
    const startX = isOffsetRow ? BOARD_WIDTH * 0.08 : BOARD_WIDTH * 0.05;
    const endX = isOffsetRow ? BOARD_WIDTH * 0.92 : BOARD_WIDTH * 0.95;

    for (let j = 0; j < pinsInRow; j++) {
        const x = startX + (j / (pinsInRow - 1)) * (endX - startX);
        // Add slight random horizontal jitter to make it less predictable
        const jitter = (Math.random() - 0.5) * (BOARD_WIDTH / pinsInRow * 0.15);
        pinLayout.push({ x: x + jitter, y });
    }
}


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
    const zonesRef = useRef<{ startX: number; endX: number; personaInfo: PersonaInfo }[]>([]);

    const [message, setMessage] = useState<string | null>("Get ready...");
    const [outcome, setOutcome] = useState<Persona | null>(null);

    const availablePersonas = useMemo(() => {
        return allPersonas.filter(p => !p.restricted || keyStatus.isValid === true);
    }, [allPersonas, keyStatus.isValid]);

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

    useEffect(() => {
        if (isOpen && sceneRef.current && !engineRef.current) {
            console.log("PersonaPlinko: Setting up Matter.js...");
            setMessage("Dropping ball...");
            setOutcome(null);

             if (availablePersonas.length === 0) {
                 console.warn("PersonaPlinko: No available personas to play with!");
                 setMessage("No personas available with current key!");
                 setTimeout(onClose, CLOSE_DELAY_MS); // Use updated delay
                 return;
             }

            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDarkMode ? '#242424' : '#ffffff';
            const pinColor = isDarkMode ? DARK_PIN_COLOR : PIN_COLOR;
            const wallColor = isDarkMode ? '#404040' : '#cccccc';

            const engine = Matter.Engine.create({ gravity: { y: GRAVITY } }); // Use updated gravity
            const render = Matter.Render.create({
                element: sceneRef.current,
                engine: engine,
                options: {
                    width: BOARD_WIDTH, // Use updated width
                    height: BOARD_HEIGHT, // Use updated height
                    wireframes: false,
                    background: bgColor,
                    pixelRatio: window.devicePixelRatio || 1
                }
            });
            engineRef.current = engine;
            renderRef.current = render;

            // --- Create Static Bodies ---
            const staticBodies: Matter.Body[] = [
                // Walls (using updated dimensions/thickness)
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, -WALL_THICKNESS / 2, BOARD_WIDTH, WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }),
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + WALL_THICKNESS / 2, BOARD_WIDTH + WALL_THICKNESS, WALL_THICKNESS, { isStatic: true, label: 'floor', render: { fillStyle: wallColor } }), // Made floor slightly wider
                Matter.Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT + WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Make walls taller
                Matter.Bodies.rectangle(BOARD_WIDTH + WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT + WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Make walls taller
                // Pins (using updated layout and radius)
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

                 // Add thin visual dividers (optional) - adjusted position based on ZONE_HEIGHT
                 if (i > 0) {
                     staticBodies.push(Matter.Bodies.rectangle(startX, BOARD_HEIGHT - (ZONE_HEIGHT / 2), 2, ZONE_HEIGHT, { isStatic: true, isSensor: true, render: { fillStyle: wallColor } }));
                 }

                 // Store zone boundaries and persona info
                 zonesRef.current.push({ startX, endX, personaInfo });
                 console.log(`Created zone for ${personaInfo.value}: ${startX.toFixed(0)} to ${endX.toFixed(0)}`);
            }
            // --- End Create Zones ---

            // Ball (using updated radius and restitution)
            const startX = BOARD_WIDTH / 2 + (Math.random() * (BOARD_WIDTH * 0.1) - (BOARD_WIDTH * 0.05)); // Slightly wider random start range
            const ball = Matter.Bodies.circle(startX, BALL_RADIUS + 10, BALL_RADIUS, { restitution: BALL_RESTITUTION, friction: 0.01, label: 'ball', render: { fillStyle: BALL_COLOR } });
            ballRef.current = ball;

            Matter.World.add(engine.world, [...staticBodies, ball]);

            const runner = Matter.Runner.create(); runnerRef.current = runner; Matter.Runner.run(runner, engine); Matter.Render.run(render);

             // --- Outcome Detection Interval ---
             if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
            settleCheckIntervalRef.current = setInterval(() => {
                const currentBall = ballRef.current;
                if (!isOpen || !currentBall || !engineRef.current || outcome !== null) return;

                // Check if ball is near the bottom (using updated ZONE_HEIGHT) and velocity is low
                if ( currentBall.position.y > BOARD_HEIGHT - ZONE_HEIGHT && Matter.Body.getSpeed(currentBall) < SETTLE_VELOCITY_THRESHOLD ) {
                    const finalX = currentBall.position.x;
                    console.log(`PersonaPlinko: Ball settled at x: ${finalX.toFixed(1)}`);

                    const landedZone = zonesRef.current.find(zone => finalX >= zone.startX && finalX < zone.endX);

                    if (landedZone) {
                         setOutcome(landedZone.personaInfo.value);
                         setMessage(`Landed on ${landedZone.personaInfo.label}!`);
                         console.log("PersonaPlinko Success! Selected:", landedZone.personaInfo.value);
                         onPersonaSelected(landedZone.personaInfo.value);
                    } else {
                         console.warn("PersonaPlinko: Ball settled outside defined zones?");
                         setMessage("Ball landed out of bounds! Try again.");
                         setOutcome(null);
                    }

                    cleanupMatter();

                    setTimeout(onClose, CLOSE_DELAY_MS); // Use updated delay
                }
            }, SETTLE_CHECK_INTERVAL);
        }

        return () => {
             if (isOpen) {
                 cleanupMatter();
             }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]); // Keep dependency array the same

    if (!isOpen) return null;

    return (
        <div className="persona-plinko-overlay" onClick={onClose}>
            <div className="persona-plinko-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Select Persona!</h4>

                {/* Container where Matter.js will render its canvas */}
                <div ref={sceneRef} className="plinko-canvas-container"> {/* CSS needs update */}
                     {/* Labels are positioned based on zonesRef, calculation updates automatically with new BOARD_WIDTH */}
                     {zonesRef.current.map(zone => (
                         <div
                            key={zone.personaInfo.value}
                            className="plinko-label"
                            style={{ left: `${((zone.startX + zone.endX) / 2 / BOARD_WIDTH) * 100}%` }}
                         >
                             {zone.personaInfo.emoji}
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

export default PersonaPlinkoGame;