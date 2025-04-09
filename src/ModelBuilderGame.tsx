// src/ModelBuilderGame.tsx - Component for selecting model parts

import React, { useState, useEffect } from 'react';
import './ModelBuilderGame.css'; // Create this CSS file
import { GeminiModel, ModelInfo, KeyValidationStatus } from './App'; // Import types from App

// --- Define Parts & Distractors ---
// Adjust these based on your actual ALL_AVAILABLE_MODELS_FRONTEND IDs
const modelVersions: string[] = ["2.0", "2.5"]; // Added distractors
const modelNames: string[] = ["Flash", "Pro"]; // Added distractors
const modelModifiers: (string | null)[] = [null, "Lite", "Experimental Thinking", "Image Generation"]; // null = no modifier

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
    // Add more part types if your model names become more complex
}

// --- Helper Function to Map Parts to Model ID ---
// *** IMPORTANT: Update this logic to EXACTLY match your ALL_AVAILABLE_MODELS_FRONTEND IDs ***
function getModelIdFromParts(parts: SelectedParts, allModels: ModelInfo[]): GeminiModel | null {
    console.log("Attempting to map parts:", parts);
    // Example logic - Needs to be precise for your actual IDs
    let potentialId = `gemini-${parts.version}-${parts.name?.toLowerCase()}`;
    if (parts.modifier === "Lite") potentialId += '-lite';
    else if (parts.modifier === "Experimental Thinking") potentialId += '-thinking-exp-01-21'; // Ensure exact ID match
    else if (parts.modifier === "Image Generation") potentialId += '-exp-image-generation'; // Ensure exact ID match
    else if (parts.modifier === null && parts.version === "2.5" && parts.name === "Pro") potentialId = 'gemini-2.5-pro-exp-03-25'; // Handle specific case
    else if (parts.modifier !== null) {
        // Very basic attempt to append other modifiers - likely needs more rules
         potentialId += `-${parts.modifier.toLowerCase().replace(/ /g, '-')}`;
    }


    console.log("Potential ID generated:", potentialId);

    // Check if the generated ID actually exists in the master list
    const foundModel = allModels.find(m => m.value === potentialId);
    if (foundModel) {
        console.log("Matched valid model:", foundModel.value);
        return foundModel.value;
    }

    console.log("No valid model matched the combination.");
    return null; // Invalid combination
}


const ModelBuilderGame: React.FC<ModelBuilderGameProps> = ({
    isOpen, onClose, onModelSelected, keyStatus, allModelsInfo, restrictedModels
}) => {
    const [selectedParts, setSelectedParts] = useState<SelectedParts>({ version: null, name: null, modifier: null });
    const [message, setMessage] = useState<string | null>("Select one part from each required column.");
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
        // If clicking the same part again, deselect it
        if(selectedParts[partType] === value) {
            setSelectedParts(prev => ({ ...prev, [partType]: null }));
        } else {
            setSelectedParts(prev => ({ ...prev, [partType]: value }));
        }
        setMessage("Select one part from each required column."); // Reset message on new selection
        setStatus('selecting');
    };

    const handleBuildAttempt = () => {
        // Check if mandatory parts are selected (adjust based on your needs)
        if (!selectedParts.version || !selectedParts.name ) {
            setStatus('error');
            setMessage("Please select at least a Version and a Name.");
            return;
        }

        setStatus('checking');
        setMessage("Checking combination...");

        // Pass allModelsInfo to the helper function
        const potentialModelId = getModelIdFromParts(selectedParts, allModelsInfo);

        // Use setTimeout to allow UI update for "checking..." message
        setTimeout(() => {
            if (!potentialModelId) {
                setStatus('error');
                setMessage("Invalid combination! Those parts don't make a known model. Try again.");
            } else {
                const isRestricted = restrictedModels.includes(potentialModelId);
                const hasValidKey = keyStatus.isValid === true;

                if (isRestricted && !hasValidKey) {
                    setStatus('error');
                    setMessage(`Model '${potentialModelId}' requires a valid Access Key! Try another combo or enter key.`);
                } else {
                    setStatus('success');
                    const modelLabel = allModelsInfo.find(m=>m.value === potentialModelId)?.label || potentialModelId;
                    setMessage(`Model selected: ${modelLabel}!`);
                    onModelSelected(potentialModelId);
                    setTimeout(onClose, 1500); // Close modal after success message
                }
            }
        }, 300); // Short delay for "checking" message
    };

    // Render null if not open
    if (!isOpen) return null;

    // Determine if build button should be enabled
    const canBuild = selectedParts.version !== null && selectedParts.name !== null;

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
                    </div>

                     {/* Column 3: Modifier */}
                     <div className="model-part-column">
                         <h5>Modifier / Feature</h5>
                        {modelModifiers.map(m => (
                             <button
                                key={`m-${m === null ? 'none' : m}`}
                                onClick={() => handlePartSelect('modifier', m)}
                                className={`part-button ${selectedParts.modifier === m ? 'selected' : ''}`}
                            >
                                {m === null ? '(None)' : m} {/* Display (None) for null */}
                             </button>
                        ))}
                    </div>
                </div>

                <div className="model-builder-actions">
                    <button
                        onClick={handleBuildAttempt}
                        className="build-button"
                        disabled={status !== 'selecting' || !canBuild} // Disable during check/success or if required parts missing
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