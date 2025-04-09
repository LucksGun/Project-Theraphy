// src/ThemePlinkoGame.tsx (Physics Version using Matter.js)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import './ThemePlinkoGame.css'; // Styles for the game modal and render area
import { AppTheme } from './App'; // Import type from App

interface ThemePlinkoGameProps {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: AppTheme;
    onThemeChange: (newTheme: AppTheme) => void;
}

// --- Constants for physics and game elements ---
const BOARD_WIDTH = 300;    // Width of the physics simulation area
const BOARD_HEIGHT = 400;   // Height of the physics simulation area
const PIN_RADIUS = 4;       // Radius of the static pins
const PIN_COLOR = '#888888'; // Color of pins (adjust as needed)
const DARK_PIN_COLOR = '#AAAAAA';
const BALL_RADIUS = 7;       // Radius of the falling ball
const BALL_COLOR = '#ff4500'; // OrangeRed ball
const WALL_THICKNESS = 40;    // Thickness of invisible boundaries (generous)
const ZONE_HEIGHT = 40;     // Height of the bottom detection zones
const GRAVITY = 0.8;        // Simulation gravity (adjust for desired speed)
const BALL_RESTITUTION = 0.3; // Bounciness (0=none, 1=perfectly elastic)
const PIN_FRICTION = 0.05;    // Friction on pins
const SETTLE_VELOCITY_THRESHOLD = 0.2; // How slow ball must be to be considered settled
const SETTLE_CHECK_INTERVAL = 300; // Check every 300ms if ball has settled
const CLOSE_DELAY_MS = 2500;   // Delay after showing result before closing

// --- Pin Layout (Adjust coordinates as needed) ---
// Using the more symmetrical layout
const pinLayout = [
    // Row 1 (1 pin) - Y increases downwards
    { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.15 },
    // Row 2 (2 pins)
    { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.25 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.25 },
    // Row 3 (3 pins)
    { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.35 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.35 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.35 },
    // Row 4 (4 pins)
    { x: BOARD_WIDTH * 0.20, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.45 }, { x: BOARD_WIDTH * 0.80, y: BOARD_HEIGHT * 0.45 },
    // Row 5 (5 pins - Widest)
    { x: BOARD_WIDTH * 0.10, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.55 }, { x: BOARD_WIDTH * 0.90, y: BOARD_HEIGHT * 0.55 },
     // Row 6 (Like Row 4)
    { x: BOARD_WIDTH * 0.20, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.65 }, { x: BOARD_WIDTH * 0.80, y: BOARD_HEIGHT * 0.65 },
    // Row 7 (Like Row 3)
    { x: BOARD_WIDTH * 0.30, y: BOARD_HEIGHT * 0.75 }, { x: BOARD_WIDTH * 0.50, y: BOARD_HEIGHT * 0.75 }, { x: BOARD_WIDTH * 0.70, y: BOARD_HEIGHT * 0.75 },
    // Row 8 (Like Row 2)
    { x: BOARD_WIDTH * 0.40, y: BOARD_HEIGHT * 0.85 }, { x: BOARD_WIDTH * 0.60, y: BOARD_HEIGHT * 0.85 },
];

// --- The Component ---
const ThemePlinkoGame: React.FC<ThemePlinkoGameProps> = ({
    isOpen, onClose, currentTheme, onThemeChange
}) => {
    const sceneRef = useRef<HTMLDivElement>(null); // Div where Matter.js will render canvas
    const engineRef = useRef<Matter.Engine | null>(null);
    const renderRef = useRef<Matter.Render | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);
    const ballRef = useRef<Matter.Body | null>(null);
    const settleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const [message, setMessage] = useState<string | null>("Get ready...");
    const [outcome, setOutcome] = useState<'light' | 'dark' | null>(null);

    // --- Cleanup Function ---
    const cleanupMatter = useCallback(() => {
        console.log("Cleaning up Matter.js instance");
        if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
        settleCheckIntervalRef.current = null;

        if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
        if (renderRef.current) Matter.Render.stop(renderRef.current);
        if (engineRef.current) Matter.World.clear(engineRef.current.world, false);
        if (engineRef.current) Matter.Engine.clear(engineRef.current);
        if (renderRef.current) {
            renderRef.current.canvas.remove();
            renderRef.current.textures = {}; // Clear textures cache
        }
        // Reset refs
        engineRef.current = null;
        renderRef.current = null;
        runnerRef.current = null;
        ballRef.current = null;
    }, []);

    // --- Setup Matter.js ---
    useEffect(() => {
        // Only run setup if isOpen is true and engine isn't already created
        if (isOpen && sceneRef.current && !engineRef.current) {
            console.log("Setting up Matter.js...");
            setMessage("Dropping ball...");
            setOutcome(null);

            // Check theme for colors
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDarkMode ? '#242424' : '#ffffff'; // Use theme colors
            const pinColor = isDarkMode ? DARK_PIN_COLOR : PIN_COLOR;
            const wallColor = isDarkMode ? '#404040' : '#cccccc'; // Subtle wall color

            // --- Create Engine ---
            const engine = Matter.Engine.create();
            engine.gravity.y = GRAVITY;
            engineRef.current = engine;

            // --- Create Renderer ---
            const render = Matter.Render.create({
                element: sceneRef.current, // Render inside this div
                engine: engine,
                options: {
                    width: BOARD_WIDTH,
                    height: BOARD_HEIGHT,
                    wireframes: false,
                    background: bgColor, // Use theme background
                    pixelRatio: window.devicePixelRatio || 1, // For sharpness
                }
            });
            renderRef.current = render;

            // --- Create Bodies ---
            // Walls (slightly outside view)
            const walls = [
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, -WALL_THICKNESS / 2, BOARD_WIDTH, WALL_THICKNESS, { isStatic: true, render: { fillStyle: wallColor } }), // Top ceiling
                Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + WALL_THICKNESS / 2, BOARD_WIDTH, WALL_THICKNESS, { isStatic: true, label: 'floor', render: { fillStyle: wallColor } }), // Floor
                Matter.Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: wallColor } }), // Left
                Matter.Bodies.rectangle(BOARD_WIDTH + WALL_THICKNESS / 2, BOARD_HEIGHT / 2, WALL_THICKNESS, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: wallColor } }), // Right
                 // Center divider between zones (make it very thin and static)
                 Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT - (ZONE_HEIGHT / 2), 2, ZONE_HEIGHT, {
                    isStatic: true,
                    label: 'divider',
                    isSensor: true, // Doesn't physically block, just detects collisions if needed
                     render: { fillStyle: 'transparent', strokeStyle: wallColor, lineWidth: 1 } // Make it barely visible
                 })
            ];

            // Pins
            const pins = pinLayout.map(pin => Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
                isStatic: true, label: 'pin', friction: PIN_FRICTION, restitution: 0.5, // Slight bounce off pins
                render: { fillStyle: pinColor }
            }));

            // Ball (random start x)
            const startX = BOARD_WIDTH / 2 + (Math.random() * 20 - 10); // Random offset from center
            const ball = Matter.Bodies.circle(startX, BALL_RADIUS + 5, BALL_RADIUS, {
                restitution: BALL_RESTITUTION, friction: 0.01, label: 'ball',
                 render: { fillStyle: BALL_COLOR }
            });
            ballRef.current = ball;

            // Add all bodies to world
            Matter.World.add(engine.world, [...walls, ...pins, ball]);

            // --- Run simulation ---
            const runner = Matter.Runner.create();
            runnerRef.current = runner;
            Matter.Runner.run(runner, engine);
            Matter.Render.run(render);

            // --- Outcome Detection Interval ---
            if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);
            settleCheckIntervalRef.current = setInterval(() => {
                const currentBall = ballRef.current;
                if (!currentBall || !engineRef.current || outcome !== null) return; // Exit if no ball or outcome already decided

                if ( currentBall.position.y > BOARD_HEIGHT - ZONE_HEIGHT && Matter.Body.getSpeed(currentBall) < SETTLE_VELOCITY_THRESHOLD ) {
                    console.log("Ball appears settled at x:", currentBall.position.x);
                    const finalOutcome = currentBall.position.x < BOARD_WIDTH / 2 ? 'light' : 'dark';
                    setOutcome(finalOutcome); // Set final outcome state

                    // Stop simulation and rendering
                    if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
                    if (renderRef.current) Matter.Render.stop(renderRef.current);
                    if (settleCheckIntervalRef.current) clearInterval(settleCheckIntervalRef.current);

                    // Handle theme change
                    if (currentTheme === finalOutcome) { setMessage(`Ball landed on ${finalOutcome}! Theme stays ${currentTheme}.`); }
                    else { setMessage(`Ball landed on ${finalOutcome}! Switching theme to ${finalOutcome}.`); onThemeChange(finalOutcome); }

                    // Schedule close
                    setTimeout(onClose, CLOSE_DELAY_MS);
                }
            }, SETTLE_CHECK_INTERVAL);
        }

        // --- Cleanup function ---
        return () => {
             if (isOpen) { // Ensure cleanup runs if modal was open
                 cleanupMatter();
             }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]); // Run only when isOpen changes

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="plinko-game-overlay" onClick={onClose}>
            <div className="plinko-game-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Theme Plinko!</h4>

                {/* Container where Matter.js will render its canvas */}
                <div ref={sceneRef} className="plinko-canvas-container">
                    {/* Static Labels positioned behind/around canvas */}
                    <div className="plinko-label-light">LIGHT</div>
                    <div className="plinko-label-dark">DARK</div>
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

export default ThemePlinkoGame;