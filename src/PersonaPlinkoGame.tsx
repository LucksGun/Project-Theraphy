// src/PersonaPlinkoGame.tsx - Physics Plinko for Persona Selection

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Matter from 'matter-js';
import './PersonaPlinkoGame.css'; // Ensure you have this CSS file
// Make sure the path to App is correct for your project structure
import { Persona, PersonaInfo } from './App';

interface PersonaPlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    onPersonaSelected: (persona: Persona) => void; // Callback for success
    hasPremiumAccess: boolean;               // Needed for filtering personas
    allPersonas: PersonaInfo[];                   // Full list of personas with details
}

// --- Constants ---
const BOARD_WIDTH = 500; // Increased width
const BOARD_HEIGHT = 650; // Increased height
const PIN_RADIUS = 5;    // Slightly larger pins
const PIN_COLOR = '#888888';
const DARK_PIN_COLOR = '#AAAAAA'; // Pin color for dark mode
const BALL_RADIUS = 9;     // Slightly larger ball
const BALL_COLOR = '#ff4500'; // OrangeRed ball color
const WALL_THICKNESS = 50; // Slightly thicker walls to match scale
const ZONE_HEIGHT = 50;    // Increased zone height slightly
const GRAVITY = 0.7;       // Slightly lower gravity for slower fall
const BALL_RESTITUTION = 0.35; // Slightly more bounce
const PIN_FRICTION = 0.05;
const SETTLE_VELOCITY_THRESHOLD = 0.2; // Speed below which the ball is considered settled
const SETTLE_CHECK_INTERVAL = 300;     // How often to check if the ball has settled (ms)
const CLOSE_DELAY_MS = 3000; // Increased delay to see result after settling

// --- Pin Layout (Denser layout for larger board) ---
const pinLayout: { x: number; y: number }[] = [];
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
        // Calculate base position
        let x = startX;
        if (pinsInRow > 1) { // Avoid division by zero if only one pin in row
             x += (j / (pinsInRow - 1)) * (endX - startX);
        } else {
             x = BOARD_WIDTH / 2; // Center if only one pin
        }

        // Add slight random horizontal jitter to make it less predictable
        const jitter = (Math.random() - 0.5) * (BOARD_WIDTH / (pinsInRow || 1) * 0.15);
        pinLayout.push({ x: x + jitter, y });
    }
}

// --- Helper function to create arc vertices ---
// Creates vertices for a thick arc segment (approximated by polygon vertices)
function createArcVertices(cx: number, cy: number, startAngle: number, endAngle: number, outerRadius: number, innerRadius: number, segments: number): Matter.Vector[] {
    const vertices: Matter.Vector[] = [];
    const angleStep = (endAngle - startAngle) / segments;

    // Outer arc points (clockwise)
    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + i * angleStep;
        vertices.push({
            x: cx + outerRadius * Math.cos(angle),
            y: cy + outerRadius * Math.sin(angle)
        });
    }

    // Inner arc points (counter-clockwise to maintain vertex order for Matter.js)
    for (let i = segments; i >= 0; i--) {
        const angle = startAngle + i * angleStep;
        vertices.push({
            x: cx + innerRadius * Math.cos(angle),
            y: cy + innerRadius * Math.sin(angle)
        });
    }

    // Matter.js expects vertices relative to the body's center.
    // We pass the calculated cx, cy to fromVertices later,
    // so we need to offset the vertices back relative to that center.
    return vertices.map(v => ({ x: v.x - cx, y: v.y - cy }));
}


// --- The Component ---
const PersonaPlinkoGame: React.FC<PersonaPlinkoGameProps> = ({
    isOpen, onClose, onPersonaSelected, hasPremiumAccess, allPersonas
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
    return allPersonas.filter(p => !p.restricted || hasPremiumAccess);
}, [allPersonas, hasPremiumAccess]);

    // --- Cleanup Function ---
    const cleanupMatter = useCallback(() => {
        console.log("PersonaPlinko: Cleaning up Matter.js");
        if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
        settleCheckIntervalRef.current = null;
        if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
        if (renderRef.current) Matter.Render.stop(renderRef.current);
        if (engineRef.current) {
            // Ensure world exists before clearing
            if (engineRef.current.world) {
                 Matter.World.clear(engineRef.current.world, false);
            }
            Matter.Engine.clear(engineRef.current);
        }
        if (renderRef.current && renderRef.current.canvas) {
             renderRef.current.canvas.remove();
        }
        // Reset refs
        engineRef.current = null;
        renderRef.current = null;
        runnerRef.current = null;
        ballRef.current = null;
        zonesRef.current = [];
        console.log("PersonaPlinko: Cleanup complete.");
    }, []); // No dependencies needed for cleanup logic itself

    // --- Setup Matter.js ---
    useEffect(() => {
        // Only setup if isOpen, the scene ref is available, AND no engine exists yet
        if (isOpen && sceneRef.current && !engineRef.current) {
            console.log("PersonaPlinko: Setting up Matter.js...");
            setMessage("Dropping ball...");
            setOutcome(null); // Reset outcome when setting up

            // Handle case where no personas are available
            if (availablePersonas.length === 0) {
                console.warn("PersonaPlinko: No available personas to play with!");
                setMessage("No personas available with current key!");
                // Schedule close and prevent further setup
                const timer = setTimeout(onClose, CLOSE_DELAY_MS);
                return () => clearTimeout(timer); // Cleanup timeout if component unmounts quickly
            }

            // Determine colors based on theme
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDarkMode ? '#242424' : '#ffffff'; // Dark/Light background
            const pinColor = isDarkMode ? DARK_PIN_COLOR : PIN_COLOR;
            const wallColor = isDarkMode ? '#404040' : '#cccccc';
            const curveColor = isDarkMode ? '#606060' : '#aaaaaa'; // Color for curves

            // Create Matter.js engine and renderer
            const engine = Matter.Engine.create({ gravity: { y: GRAVITY } }); // Use updated gravity
            const render = Matter.Render.create({
                element: sceneRef.current,
                engine: engine,
                options: {
                    width: BOARD_WIDTH, // Use updated width
                    height: BOARD_HEIGHT, // Use updated height
                    wireframes: false, // Show solid shapes
                    background: bgColor,
                    pixelRatio: window.devicePixelRatio || 1 // Adjust for high DPI screens
                }
            });

            // Store refs
            engineRef.current = engine;
            renderRef.current = render;

            // --- Define Curved Obstacle Vertices ---
            const curveSegments = 12; // More segments for smoother curve approximation
            const curveThickness = 10;
            const curveOuterRadius = BOARD_WIDTH * 0.35;
            const curveInnerRadius = curveOuterRadius - curveThickness;
            const curveCenterY = BOARD_HEIGHT * 0.25; // Position curves vertically

             // Calculate curve centers (adjust if needed)
            const leftCurveCenterX = BOARD_WIDTH * 0.15;
            const rightCurveCenterX = BOARD_WIDTH * 0.85;

            // Left Curve (Angles adjusted for visual appeal)
            const leftCurveVertices = createArcVertices(
                leftCurveCenterX,
                curveCenterY,
                Math.PI / 9, // ~20 deg
                Math.PI / 2.1, // ~85 deg
                curveOuterRadius,
                curveInnerRadius,
                curveSegments
            );

            // Right Curve (Symmetrical angles)
            const rightCurveVertices = createArcVertices(
                rightCurveCenterX,
                curveCenterY,
                Math.PI - Math.PI / 2.1, // ~95 deg
                Math.PI - Math.PI / 9, // ~160 deg
                curveOuterRadius,
                curveInnerRadius,
                curveSegments
            );

            // --- Create Static Bodies ---
            const staticBodies: Matter.Body[] = [
                // Walls (using updated dimensions/thickness)
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, -WALL_THICKNESS / 2, BOARD_WIDTH + WALL_THICKNESS, WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Slightly wider top wall
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + WALL_THICKNESS / 2, BOARD_WIDTH + WALL_THICKNESS, WALL_THICKNESS, { isStatic: true, label: 'floor', render: { fillStyle: wallColor } }), // Wider floor
                Matter.Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT + WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Taller walls
                Matter.Bodies.rectangle(BOARD_WIDTH + WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT + WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Taller walls

                // Pins (using updated layout and radius)
                ...pinLayout.map(pin => Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
                     isStatic: true,
                     label: 'pin',
                     friction: PIN_FRICTION,
                     restitution: 0.5, // Pins can have slightly higher restitution than ball
                     render: { fillStyle: pinColor }
                 })),

                // **** Add Curved Obstacles ****
                Matter.Bodies.fromVertices(leftCurveCenterX, curveCenterY, [leftCurveVertices], {
                    isStatic: true,
                    label: 'curve_left',
                    friction: 0.05, // Match pin friction
                    restitution: 0.5, // Match pin restitution
                    render: { fillStyle: curveColor }
                }),
                 Matter.Bodies.fromVertices(rightCurveCenterX, curveCenterY, [rightCurveVertices], {
                    isStatic: true,
                    label: 'curve_right',
                    friction: 0.05,
                    restitution: 0.5,
                    render: { fillStyle: curveColor }
                }),
            ];

            // --- Create Persona Zones at Bottom ---
            const numZones = availablePersonas.length;
            const zoneWidth = BOARD_WIDTH / numZones;
            zonesRef.current = []; // Reset zones ref before populating

            for (let i = 0; i < numZones; i++) {
                const personaInfo = availablePersonas[i];
                const startX = i * zoneWidth;
                const endX = (i + 1) * zoneWidth;

                // Add thin visual dividers between zones (optional)
                if (i > 0) {
                    staticBodies.push(Matter.Bodies.rectangle(
                        startX, // Position at the start of the zone (left edge)
                        BOARD_HEIGHT - (ZONE_HEIGHT / 2), // Vertically centered in the zone area
                        2, // Thin divider width
                        ZONE_HEIGHT, // Height of the zone
                        {
                            isStatic: true,
                            isSensor: true, // Sensor so ball passes through, just visual
                            render: { fillStyle: wallColor } // Use wall color for dividers
                        }
                    ));
                }

                // Store zone boundaries and associated persona info
                zonesRef.current.push({ startX, endX, personaInfo });
                // console.log(`Created zone for ${personaInfo.value}: ${startX.toFixed(0)} to ${endX.toFixed(0)}`);
            }
            // --- End Create Zones ---

            // --- Create the Ball ---
            const startX = BOARD_WIDTH / 2 + (Math.random() * (BOARD_WIDTH * 0.1) - (BOARD_WIDTH * 0.05)); // Start near center top with slight random offset
            const ball = Matter.Bodies.circle(
                startX,
                BALL_RADIUS + 10, // Start slightly above the top
                BALL_RADIUS,
                {
                    restitution: BALL_RESTITUTION, // Use defined ball restitution
                    friction: 0.01, // Low friction for rolling
                    label: 'ball',
                    render: { fillStyle: BALL_COLOR }
                }
            );
            ballRef.current = ball; // Store ref to the ball body

            // Add all bodies (walls, pins, curves, dividers, ball) to the world
            Matter.World.add(engine.world, [...staticBodies, ball]);

            // --- Run Simulation ---
            const runner = Matter.Runner.create();
            runnerRef.current = runner;
            Matter.Runner.run(runner, engine); // Start the physics engine loop
            Matter.Render.run(render);        // Start the rendering loop

            // --- Outcome Detection Interval ---
            // Clear any previous interval before setting a new one
            if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);

            settleCheckIntervalRef.current = setInterval(() => {
                const currentBall = ballRef.current;
                // Check if simulation should still be running and outcome not decided
                // Added check for engineRef.current?.world to prevent errors during cleanup race conditions
                if (!isOpen || !currentBall || !engineRef.current?.world || outcome !== null) {
                     // If checks fail, clear interval and stop. Avoids checks after cleanup started.
                     if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
                     settleCheckIntervalRef.current = null;
                    return;
                }

                 // Check if ball is within the bottom zone height and moving slowly
                if ( currentBall.position.y > BOARD_HEIGHT - ZONE_HEIGHT &&
                     Matter.Body.getSpeed(currentBall) < SETTLE_VELOCITY_THRESHOLD )
                {
                    const finalX = currentBall.position.x;
                    console.log(`PersonaPlinko: Ball settled at x: ${finalX.toFixed(1)}, y: ${currentBall.position.y.toFixed(1)}`);

                    // Find which zone the ball landed in
                    const landedZone = zonesRef.current.find(zone => finalX >= zone.startX && finalX < zone.endX);

                    if (landedZone) {
                        setOutcome(landedZone.personaInfo.value); // Set final outcome state
                        setMessage(`Selected: ${landedZone.personaInfo.label}!`);
                        console.log("PersonaPlinko Success! Selected:", landedZone.personaInfo.value, landedZone.personaInfo.label);
                        onPersonaSelected(landedZone.personaInfo.value); // Call the success callback immediately
                    } else {
                        // This case should be rare if zones cover the entire bottom width
                        console.warn("PersonaPlinko: Ball settled outside defined zones? Final X:", finalX);
                        setMessage("Landed out of bounds! Closing.");
                        setOutcome(null); // Indicate no selection was made
                        // Maybe call onClose directly or after a shorter delay?
                    }

                    // --- Stop Simulation and Schedule Close ---
                    // Clear the interval FIRST to prevent it running again
                     if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
                     settleCheckIntervalRef.current = null;

                    // Stop physics and rendering AFTER determining outcome
                     if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
                     if (renderRef.current) Matter.Render.stop(renderRef.current);

                    console.log("PersonaPlinko: Simulation stopped.");

                    // Schedule the modal to close after the specified delay

                    // Store the timer ID so we can clear it if needed during unmount/cleanup
                    // (Though cleanupMatter should handle the interval)
                    // settleCheckIntervalRef.current = closeTimer; // Re-using ref is confusing, better manage separately if needed

                 } // End if ball settled
            }, SETTLE_CHECK_INTERVAL); // End setInterval

        } // End if (isOpen && sceneRef.current && !engineRef.current)

        // --- Effect Cleanup Function ---
        return () => {
            console.log("PersonaPlinko: Effect cleanup triggered (isOpen changed or unmount). isOpen:", isOpen);
            // Cleanup Matter.js instance *only if* the effect setup ran (engineRef exists)
            // This prevents cleanup attempts if the component closes before setup completes
             if (engineRef.current) {
                cleanupMatter();
             }
            // Also clear interval just in case it's still running during fast open/close cycles
             if (settleCheckIntervalRef.current) {
                 clearInterval(settleCheckIntervalRef.current);
                 settleCheckIntervalRef.current = null;
             }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, availablePersonas.length]); // Rerun effect if isOpen changes or the number of available personas changes


    // Render nothing if the modal is not open
    if (!isOpen) return null;

    // --- Render JSX ---
    return (
        <div className="persona-plinko-overlay" onClick={onClose}> {/* Background overlay */}
            {/* Modal container, stop propagation prevents overlay click closing it */}
            <div className="persona-plinko-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Select Persona!</h4>

                {/* Container where Matter.js will render its canvas */}
                {/* Needs fixed dimensions matching constants, defined in CSS */}
                <div ref={sceneRef} className="plinko-canvas-container">
                    {/* Dynamically create labels based on calculated zones */}
                    {/* Render labels only after zonesRef is populated */}
                    {zonesRef.current.length > 0 && zonesRef.current.map(zone => (
                        <div
                            key={zone.personaInfo.value} // Use unique persona value as key
                            className="plinko-label"
                            // Calculate center X percentage for label positioning
                            style={{ left: `${((zone.startX + zone.endX) / 2 / BOARD_WIDTH) * 100}%` }}
                        >
                            {zone.personaInfo.emoji} {/* Show emoji as the label */}
                        </div>
                    ))}
                </div>

                {/* Display status messages */}
                <p className="plinko-message" aria-live="polite">
                    {message || ' '} {/* Display message or empty space */}
                </p>

                {/* Close/Cancel button */}
                <button onClick={() => {
                    // When manually closing, ensure cleanup happens
                    cleanupMatter();
                    onClose();
                 }}
                 className="plinko-button cancel"
                >
                    {/* Change button text based on whether an outcome was reached */}
                    {outcome ? "Close" : "Cancel Game"}
                </button>
            </div>
        </div>
    );
};

export default PersonaPlinkoGame;