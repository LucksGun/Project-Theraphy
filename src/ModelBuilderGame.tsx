// src/ModelBuilderGame.tsx (New File)

import React, { useState, useEffect } from 'react';
import './ModelBuilderGame.css'; // Create this CSS file
import { GeminiModel, ModelInfo, KeyValidationStatus } from './App'; // Import types

// --- Define Parts & Distractors ---
// Adjust these based on your ALL_AVAILABLE_MODELS_FRONTEND
const modelVersions = ["2.0", "2.5"]; // Add distractors like "1.5" maybe?
const modelNames = ["Flash", "Pro"];    // Add distractors like "Ultra"?
const modelModifiers = ["Lite", "Experimental Thinking", "Image Generation", null]; // null represents no modifier, add distractors like "Advanced"?
// Add more columns/parts if needed based on model names

interface ModelBuilderGameProps {
    isOpen: boolean;
    onClose: () => void;
    onModelSelected: (model: GeminiModel) => void;
    keyStatus: KeyValidationStatus;
    allModelsInfo: ModelInfo[]; // Pass the full model info list
    restrictedModels: GeminiModel[]; // Pass the list of restricted IDs
}

interface SelectedParts {
    version: string | null;
    name: string | null;
    modifier: string | null;
    // Add more keys if you have more columns
}

// --- Helper Function to Map Parts to Model ID ---
// This needs careful implementation based on your exact model names!
function getModelIdFromParts(parts: SelectedParts): GeminiModel | null {
    // Example basic logic - MAKE THIS ROBUST for your specific names
    if (parts.version === '2.0' && parts.name === 'Flash' && parts.modifier === 'Lite') return 'gemini-2.0-flash-lite';
    if (parts.version === '2.0' && parts.name === 'Flash' && parts.modifier === null) return 'gemini-2.0-flash';
    if (parts.version === '2.0' && parts.name === 'Flash' && parts.modifier === 'Experimental Thinking') return 'gemini-2.0-flash-thinking-exp-01-21';
    if (parts.version === '2.0' && parts.name === 'Flash' && parts.modifier === 'Image Generation') return 'gemini-2.0-flash-exp-image-generation';
    if (parts.version === '2.5' && parts.name === 'Pro' && parts.modifier === null ) return 'gemini-2.5-pro-exp-03-25'; // Assuming Exp is default Pro 2.5? Check your IDs

    // Add logic for ALL your valid combinations
    // ...

    return null; // Invalid combination
}


const ModelBuilderGame: React.FC<ModelBuilderGameProps> = ({
    isOpen, onClose, onModelSelected, keyStatus, restrictedModels
}) => {
    const [selectedParts, setSelectedParts] = useState<SelectedParts>({ version: null, name: null, modifier: null });
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'selecting' | 'checking' | 'success' | 'error'>('selecting');

    // Reset selections when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedParts({ version: null, name: null, modifier: null });
            setMessage("Select one part from each required column.");
            setStatus('selecting');
        }
    }, [isOpen]);

    const handlePartSelect = (partType: keyof SelectedParts, value: string | null) => {
        setSelectedParts(prev => ({ ...prev, [partType]: value }));
        setMessage("Select one part from each required column."); // Reset message on new selection
        setStatus('selecting');
    };

    const handleBuildAttempt = () => {
        // Basic check if all required parts are selected
        // Adjust this based on which parts are mandatory for *any* model
        if (!selectedParts.version || !selectedParts.name /* || !selectedParts.modifier - modifier can be null */) {
            setStatus('error');
            setMessage("Please select a part from each column (modifier is optional).");
            return;
        }

        setStatus('checking');
        setMessage("Checking combination...");

        const potentialModelId = getModelIdFromParts(selectedParts);

        // Use setTimeout to allow UI update for "checking..." message
        setTimeout(() => {
            if (!potentialModelId) {
                // Invalid Combination
                setStatus('error');
                setMessage("Invalid combination! Those parts don't make a known model. Try again.");
                // Optional: Reset selection after a delay?
                // setTimeout(() => setSelectedParts({ version: null, name: null, modifier: null }), 1500);
            } else {
                // Valid Combination - Check Restriction
                const isRestricted = restrictedModels.includes(potentialModelId);
                const hasValidKey = keyStatus.isValid === true;

                if (isRestricted && !hasValidKey) {
                    // Restricted Model & No Valid Key
                    setStatus('error');
                    setMessage(`Model '${potentialModelId}' requires a valid Access Key! Try another combo or enter key.`);
                    // Optional: Reset selection
                    // setTimeout(() => setSelectedParts({ version: null, name: null, modifier: null }), 1500);
                } else {
                    // SUCCESS!
                    setStatus('success');
                    setMessage(`Model selected: ${potentialModelId}!`);
                    onModelSelected(potentialModelId); // Call callback to update App state
                    setTimeout(onClose, 1500); // Close modal after success message
                }
            }
        }, 300); // Short delay for "checking" message
    };

    // Render null if not open
    if (!isOpen) return null;

    return (
        <div className="model-builder-overlay" onClick={onClose}>
            <div className="model-builder-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Build Your AI Model</h4>
                <p className={`game-message ${status}`}>{message || " "}</p>

                <div className="model-parts-container">
                    {/* Column 1: Version */}
                    <div className="model-part-column">
                        <h5>Version</h5>
                        {modelVersions.map(v => (
                            <button
                                key={`v-${v}`}
                                onClick={() => handlePartSelect('version', v)}
                                className={`part-button ${selectedParts.version === v ? 'selected' : ''}`}
                            >{v}</button>
                        ))}
                         <button onClick={() => handlePartSelect('version', '1.5')} className={`part-button ${selectedParts.version === '1.5' ? 'selected' : ''}`}>1.5</button> {/* Distractor */}
                    </div>

                    {/* Column 2: Name */}
                    <div className="model-part-column">
                         <h5>Name</h5>
                        {modelNames.map(n => (
                            <button
                                key={`n-${n}`}
                                onClick={() => handlePartSelect('name', n)}
                                className={`part-button ${selectedParts.name === n ? 'selected' : ''}`}
                            >{n}</button>
                        ))}
                         <button onClick={() => handlePartSelect('name', 'Ultra')} className={`part-button ${selectedParts.name === 'Ultra' ? 'selected' : ''}`}>Ultra</button> {/* Distractor */}
                    </div>

                     {/* Column 3: Modifier */}
                     <div className="model-part-column">
                         <h5>Modifier / Feature</h5>
                        {/* Add null explicitly for models without a specific modifier */}
                         <button onClick={() => handlePartSelect('modifier', null)} className={`part-button ${selectedParts.modifier === null ? 'selected' : ''}`}> (None) </button>
                        {modelModifiers.filter(m => m !== null).map(m => ( // Filter out null for mapping
                            <button
                                key={`m-${m}`}
                                onClick={() => handlePartSelect('modifier', m)}
                                className={`part-button ${selectedParts.modifier === m ? 'selected' : ''}`}
                            >{m}</button>
                        ))}
                         <button onClick={() => handlePartSelect('modifier', 'Advanced')} className={`part-button ${selectedParts.modifier === 'Advanced' ? 'selected' : ''}`}>Advanced</button> {/* Distractor */}
                    </div>
                </div>

                <div className="model-builder-actions">
                    <button
                        onClick={handleBuildAttempt}
                        className="build-button"
                        disabled={status === 'checking' || status === 'success' || !selectedParts.version || !selectedParts.name} // Disable during check/success or if required parts missing
                    >
                        Confirm Combination
                    </button>
                    <button onClick={onClose} className="cancel-button">Cancel</button>
                </div>

            </div>
        </div>
    );
};

export default ModelBuilderGame;