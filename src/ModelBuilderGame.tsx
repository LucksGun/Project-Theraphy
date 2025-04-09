// src/ModelBuilderGame.tsx /* Filename as requested, content is for Guesser Game */

import React, { useState, useEffect, useCallback } from 'react';
// Import the CSS file with the matching name
import './ModelBuilderGame.css';
// Import only the types needed for *this* component's props/logic
// If you later decide to use allModelsInfo or keyStatus, uncomment them here and in props
import { GeminiModel } from './App';
// import { ModelInfo, KeyValidationStatus } from './App'; // Keep commented out if not used in props

// --- Define Potential Parts & Distractors ---
// Ensure these lists cover all parts of your VALID_MODEL_IDS plus desired distractors
// Example Lists - ADJUST THESE TO MATCH YOUR MODELS
const ALL_VERSIONS: (string | null)[] = ["1.5", "2.0", "2.5", "pro", "flash", "latest"];
const ALL_NAMES: (string | null)[] = ["Flash", "Pro", "Ultra", "Nano", null];
const ALL_MODIFIERS: (string | null)[] = ["Lite", "Experimental Thinking", "Image Generation", "Advanced", "Video", null];

// --- !!! IMPORTANT: DEFINE YOUR VALID MODELS !!! ---
// Populate this array with ALL the actual, valid GeminiModel IDs the game can pick from.
const VALID_MODEL_IDS: GeminiModel[] = [
    // --- Add your real model IDs here! ---
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-thinking-exp-01-21',
    'gemini-2.0-flash-exp-image-generation',
    'gemini-2.5-pro-exp-03-25',
    // --- Ensure this list is complete and accurate ---
];

// Interface to hold the broken-down parts of a model ID
interface ModelParts {
    version: string | null;
    name: string | null;
    modifier: string | null;
}

// --- !!! IMPORTANT: REFINE THIS FUNCTION !!! ---
// Helper Function to Extract Parts from Model ID. Needs to be robust for YOUR names.
function extractPartsFromId(modelId: GeminiModel): ModelParts {
    const parts: ModelParts = { version: null, name: null, modifier: null };
    if (!modelId) return parts;
    const idLower = modelId.toLowerCase();

    // --- Modifier Extraction (Check specific first) ---
    if (idLower.includes('thinking-exp')) parts.modifier = "Experimental Thinking";
    else if (idLower.includes('image-generation')) parts.modifier = "Image Generation";
    else if (idLower.includes('lite')) parts.modifier = "Lite";
    // Add more...

     // --- Version and Name Extraction ---
     if (idLower.includes('2.5')) parts.version = "2.5";
     else if (idLower.includes('2.0')) parts.version = "2.0";
     else if (idLower.includes('1.5')) parts.version = "1.5";

    if (idLower.includes('-flash')) parts.name = "Flash";
    else if (idLower.includes('-pro')) parts.name = "Pro";

     // --- Handle base models & Overrides ---
     if (idLower === 'gemini-pro') { parts.version = "pro"; parts.name = null; parts.modifier = null; }
     else if (idLower === 'gemini-flash') { parts.version = "flash"; parts.name = null; parts.modifier = null; }
     else if (modelId === 'gemini-2.5-pro-exp-03-25') { parts.version = "2.5"; parts.name = "Pro"; parts.modifier = "Experimental"; }
     // Add more specific overrides...

    // --- Fallbacks/Refinements ---
    if (parts.version === null) { if (parts.name === 'Pro') parts.version = 'pro'; else if (parts.name === 'Flash') parts.version = 'flash'; } // This is now correct
    if (parts.name === null) { if (parts.version === '1.5' && idLower.includes('-pro')) parts.name = 'Pro'; else if (parts.version === '1.5' && idLower.includes('-flash')) parts.name = 'Flash';}
    // Add more fallbacks as needed...

    console.log(`Extracted from ${modelId}:`, JSON.stringify(parts)); // Debugging
    return parts;
}

// --- Component Props Interface ---
interface ModelBuilderGameProps { // Keep name ModelBuilderGameProps if file is ModelBuilderGame.tsx
    isOpen: boolean;
    onClose: () => void;
    // If you need model info or key status later, uncomment these and their imports
    // allModelsInfo?: ModelInfo[];
    // keyStatus?: KeyValidationStatus;
}

// --- Types for Game State ---
type GuessStage = 'version' | 'name' | 'modifier' | 'finished' | 'failed';
// Ensure this includes ALL states used in comparisons and setGameStatus calls
type GameStatus = 'initializing' | 'playing' | 'won' | 'failed' | 'restarting';
type MessageType = 'info' | 'success' | 'error';


// --- Component Definition ---
// Use the same component name as the file for consistency, even though it's the "Guesser" logic
const ModelBuilderGame: React.FC<ModelBuilderGameProps> = ({
    isOpen, onClose
    // Destructure other props here if you add them back (allModelsInfo, keyStatus)
}) => {
    // --- State ---
    const [targetModelId, setTargetModelId] = useState<GeminiModel | null>(null);
    const [targetParts, setTargetParts] = useState<ModelParts | null>(null);
    const [revealedParts, setRevealedParts] = useState<Partial<ModelParts>>({});
    const [currentStage, setCurrentStage] = useState<GuessStage>('version');
    const [currentProposalIndex, setCurrentProposalIndex] = useState<number>(0);
    const [message, setMessage] = useState<string>("");
    const [messageType, setMessageType] = useState<MessageType>('info');
    // Ensure the state type matches the full GameStatus type definition
    const [gameStatus, setGameStatus] = useState<GameStatus>('initializing');

    // --- Callbacks ---
    const getOptionsForStage = useCallback((stage: GuessStage): (string | null)[] => {
        switch (stage) {
            case 'version': return ALL_VERSIONS;
            case 'name': return ALL_NAMES;
            case 'modifier': return ALL_MODIFIERS;
            default: return [];
        }
    }, []);

     const startGame = useCallback(() => {
        console.log("Starting/Restarting game...");
        setGameStatus('initializing');
        setMessage("Selecting a secret model...");
        setMessageType('info');
        setRevealedParts({});

        setTimeout(() => {
            if (VALID_MODEL_IDS.length === 0) {
                console.error("VALID_MODEL_IDS array is empty!");
                setMessage("Error: No valid models defined for the game.");
                setMessageType('error'); setGameStatus('failed'); return;
            }
            // --- Pick Random Model ---
            // If using props for filtering (e.g., based on keyStatus), calculate availableModels here
            const availableModels = VALID_MODEL_IDS; // Replace with filtered list if needed
             if (availableModels.length === 0) {
                 setMessage("Error: No models available for guessing game based on current settings.");
                 setMessageType('error'); setGameStatus('failed'); return;
             }
            const randomIndex = Math.floor(Math.random() * availableModels.length);
            const secretModelId = availableModels[randomIndex];
            const secretParts = extractPartsFromId(secretModelId);

            // --- Validate Extraction ---
            if (!secretParts.version) { // Adjust required parts check if needed
                console.error(`Failed to extract required parts for '${secretModelId}'. Extracted:`, secretParts);
                setMessage("Error initializing game (extraction failed). Please close and report this.");
                setMessageType('error'); setGameStatus('failed'); setTargetModelId(null); setTargetParts(null); return;
            }
            // --- Set Initial Game State ---
            console.log("Target Model:", secretModelId, "Target Parts:", secretParts);
            setTargetModelId(secretModelId);
            setTargetParts(secretParts);
            setCurrentStage('version');
            setCurrentProposalIndex(0);
            setGameStatus('playing');
            setMessage("Okay, I have a model in mind. Let's start with the version.");
            setMessageType('info');
        }, 300);
        // Add dependencies like getAvailableTargetModels if filtering is implemented
    }, [/* Add dependencies here if needed */]);

     // --- Effects ---
     useEffect(() => {
         if (isOpen) {
             startGame();
         } else {
             setTargetModelId(null); setTargetParts(null); setRevealedParts({});
             setCurrentStage('version'); setCurrentProposalIndex(0); setMessage("");
             setGameStatus('initializing');
         }
     }, [isOpen, startGame]);

     // --- Derived State / Calculations ---
     const getCurrentProposal = (): string | null => {
         if (gameStatus !== 'playing' || currentStage === 'finished' || currentStage === 'failed') return null;
         const options = getOptionsForStage(currentStage); if (currentProposalIndex >= 0 && currentProposalIndex < options.length) { return options[currentProposalIndex]; }
         console.warn(`Proposal index ${currentProposalIndex} out of bounds for stage ${currentStage}`); return null; };


    const currentProposal = getCurrentProposal();
    const currentQuestion = (gameStatus === 'playing' && targetParts && currentProposal !== null)
        ? `Is the ${currentStage} '${currentProposal === null ? '(None)' : currentProposal}'?`
        : (gameStatus === 'initializing' ? "Initializing..." : gameStatus === 'restarting' ? "Restarting..." : gameStatus === 'failed' ? (message.includes("extraction failed") ? message : "Game failed.") : gameStatus === 'won' ? "Model identified!" : "Loading...");
    const isInteractionDisabled = gameStatus !== 'playing' || currentProposal === null;

    // --- Action Handlers (Yes/No) ---
    const handleYes = () => {
        if (isInteractionDisabled || !targetParts) return;
        const correctPart = targetParts[currentStage as keyof ModelParts];
        const proposalText = currentProposal === null ? '(None)' : currentProposal;

        if (currentProposal === correctPart) { // CORRECT GUESS
            const newRevealedParts = { ...revealedParts, [currentStage]: correctPart };
            setRevealedParts(newRevealedParts);
            const successMessage = `Yes! The ${currentStage} is '${proposalText}'.`;
            setMessage(successMessage); setMessageType('success');

            if (currentStage === 'version') { setTimeout(() => { setCurrentStage('name'); setCurrentProposalIndex(0); setMessage("Now for the name..."); setMessageType('info'); }, 1500); } // Corrected: Changed from 'version' to 'name'
            else if (currentStage === 'name') { setTimeout(() => { setCurrentStage('modifier'); setCurrentProposalIndex(0); setMessage("Does it have a special modifier/feature?"); setMessageType('info'); }, 1500); }
            else if (currentStage === 'modifier') { // WIN
                setMessage(successMessage + `\nYou guessed it! The model is: ${targetModelId}`); setMessageType('success');
                setCurrentStage('finished'); setGameStatus('won');
            }
        } else { // INCORRECT "Yes"
             setMessage(`Oops! The ${currentStage} wasn't '${proposalText}'. Let's try a different model.`); setMessageType('error');
             setGameStatus('restarting'); setTimeout(startGame, 2000);
        }
    };

    const handleNo = () => {
         if (isInteractionDisabled || !targetParts) return;
         const correctPart = targetParts[currentStage as keyof ModelParts];
         const proposalText = currentProposal === null ? '(None)' : currentProposal;

         if (currentProposal === correctPart) { // User denied CORRECT part
             setMessage(`Hmm, actually the ${currentStage} *was* '${proposalText}'. Let's try a different model.`); setMessageType('error');
             setGameStatus('restarting'); setTimeout(startGame, 2000);
         } else { // User correctly denied INCORRECT part
             const options = getOptionsForStage(currentStage);
             const nextIndex = currentProposalIndex + 1;
             if (nextIndex < options.length) { // Propose next option
                 setCurrentProposalIndex(nextIndex); setMessage(`Okay, not '${proposalText}'. Let's see...`); setMessageType('info');
             } else { // Exhausted options
                 console.error(`Exhausted options for ${currentStage}. Correct part (${correctPart}) not confirmed. Target: ${targetModelId}`);
                 setMessage("Ran out of options for this part! Something is wrong. Restarting..."); setMessageType('error');
                 setGameStatus('restarting'); setTimeout(startGame, 2500);
             }
         }
     };

    // --- Rendering ---
    if (!isOpen) return null;
    const formatPart = (partValue: string | null | undefined) => (partValue === undefined ? '___' : partValue === null ? '(None)' : partValue);
    const displayVersion = formatPart(revealedParts.version);
    const displayName = formatPart(revealedParts.name);
    const displayModifier = formatPart(revealedParts.modifier);

    return (
        <div className="model-builder-overlay" onClick={onClose}>
            {/* Use the modal class defined in the CSS */}
            <div className="model-guesser-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Guess the AI Model!</h4>
                 <div className="revealed-model-display">
                     <span>Gemini</span><span className="hyphen">-</span>
                     <span className={!revealedParts.hasOwnProperty('version') ? 'placeholder' : ''}>{displayVersion}</span><span className="hyphen">-</span>
                     <span className={!revealedParts.hasOwnProperty('name') ? 'placeholder' : ''}>{displayName}</span><span className="hyphen">-</span>
                     <span className={!revealedParts.hasOwnProperty('modifier') ? 'placeholder' : ''}>{displayModifier}</span>
                 </div>
                <p className={`game-message ${messageType}`}>{message || " "}</p>
                 <div className="guessing-area">
                    {gameStatus === 'playing' && currentProposal !== null && (
                        <>
                            <div className="current-question">{currentQuestion}</div>
                            <div className="yes-no-buttons">
                                <button onClick={handleYes} className="yes-button" disabled={isInteractionDisabled}>Yes</button>
                                <button onClick={handleNo} className="no-button" disabled={isInteractionDisabled}>No</button>
                            </div>
                        </>
                    )}
                     {(gameStatus === 'initializing' || gameStatus === 'restarting') && (<div className="current-question">Please wait...</div>)}
                     {gameStatus === 'won' && (<div className="current-question">Congratulations!</div>)}
                     {gameStatus === 'failed' && (<div className="current-question">Game Error. Please close or restart.</div>)}
                </div>
                <div className="model-guesser-actions">
                     
                    <button onClick={onClose} className="close-button">Close</button>
                </div>
            </div>
        </div>
    );
};

// Export using the filename for consistency
export default ModelBuilderGame;
