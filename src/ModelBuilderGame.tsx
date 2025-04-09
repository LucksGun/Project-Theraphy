// src/ModelBuilderGame.tsx - Component for selecting model parts with cascading filters

import React, { useState, useEffect, useMemo } from 'react';
import './ModelBuilderGame.css'; // Ensure this CSS file exists
import { GeminiModel, ModelInfo, KeyValidationStatus } from './App'; // Import types from App

// --- Define Parts & Distractors ---
// These lists contain ALL possible options that *might* appear.
const allPossibleVersions: string[] = ["2.0", "2.5"];
const allPossibleNames: string[] = ["Flash", "Pro"];
const allPossibleModifiers: (string | null)[] = [null, "Lite", "Experimental Thinking", "Image Generation"];

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
}

// --- Helper Function to Map Parts to Model ID ---
// *** IMPORTANT: This logic MUST precisely match your actual model ID structure ***
function getModelIdFromParts(parts: SelectedParts, allModels: ModelInfo[]): GeminiModel | null {
    // If essential parts are missing, cannot form an ID
    if (!parts.version || !parts.name) {
        return null;
    }

    // Construct the potential ID based on parts - this requires accurate mapping!
    let potentialId = `gemini-${parts.version}-${parts.name.toLowerCase()}`;

    // --- Precise Modifier Mapping (Examples - ADJUST TO YOUR IDs) ---
    if (parts.modifier === "Lite") {
        potentialId += '-lite';
    } else if (parts.modifier === "Experimental Thinking") {
        // Example specific ID suffix
        potentialId += '-thinking-exp-01-21';
    } else if (parts.modifier === "Image Generation") {
        // Example specific ID suffix
        potentialId += '-exp-image-generation';
    } else if (parts.modifier === null) {
        // Handle cases where 'null' modifier maps to a specific ID explicitly
         if (parts.version === "2.5" && parts.name === "Pro") {
             potentialId = 'gemini-2.5-pro-exp-03-25'; // Specific ID for 2.5 Pro (null modifier selection)
         }
         // Add other explicit null-modifier cases if needed
         // else: the base ID without suffix might be correct for other null cases
    }
    // NOTE: Add more 'else if (parts.modifier === "...")' conditions for any other specific modifiers.

    console.log("Attempting to validate generated ID:", potentialId);

    // Check if the precisely generated ID exists in the master list
    const foundModel = allModels.find(m => m.value === potentialId);
    if (foundModel) {
        console.log("Matched valid model:", foundModel.value);
        return foundModel.value;
    }

    console.log(`Generated ID "${potentialId}" not found in valid models.`);
    return null; // Combination did not yield a known model ID
}

// --- Helper to get DISPLAY modifier FROM a valid model ID ---
// *** This is the reverse logic, also needs to be precise ***
function getDisplayModifierFromModelId(modelId: GeminiModel): string | null {
    // Check for specific known suffixes IN ORDER OF SPECIFICITY
    if (modelId.endsWith('-thinking-exp-01-21')) return "Experimental Thinking";
    if (modelId.endsWith('-exp-image-generation')) return "Image Generation";
    if (modelId.endsWith('-lite')) return "Lite";
     // Add checks for other specific modifiers
     // ...

     // Check for explicit null-modifier cases that have a suffix
     if (modelId === 'gemini-2.5-pro-exp-03-25') return null; // This specific ID maps back to selecting '(None)'

    // If no specific modifier suffix is found, assume it's the 'null' (None) modifier
    // Basic check: does it look like base version-name? (e.g., gemini-2.0-flash)
    // This might need refinement based on your ID patterns
    if (/^gemini-\d\.\d-(flash|pro)$/.test(modelId)) {
         return null;
    }

    // Fallback if ID structure is unrecognized (should ideally not happen with known models)
    console.warn("Could not determine display modifier for ID:", modelId);
    return null; // Use undefined to signal an issue / unknown state if needed
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

    // --- Calculate Available Options based on Selection ---

    // Available Names (depends on selected Version)
    const availableNames = useMemo(() => {
        if (!selectedParts.version) {
            // If no version selected, all names are potentially available initially
            return allPossibleNames;
        }
        const validNames = new Set<string>();
        const versionPrefix = `gemini-${selectedParts.version}-`;

        allModelsInfo.forEach(model => {
            if (model.value.startsWith(versionPrefix)) {
                // Attempt to extract the name part (e.g., "flash" or "pro")
                const parts = model.value.substring(versionPrefix.length).split('-');
                const namePart = parts[0];
                // Map back to display name (simple capitalization for this example)
                const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                if (allPossibleNames.includes(displayName)) {
                    validNames.add(displayName);
                }
            }
        });
        return Array.from(validNames);
    }, [selectedParts.version, allModelsInfo]);

    // Available Modifiers (depends on selected Version and Name)
    const availableModifiers = useMemo(() => {
        if (!selectedParts.version || !selectedParts.name) {
            // If version or name missing, all modifiers potentially available
            return allPossibleModifiers;
        }
        const validModifiers = new Set<string | null>();
        // Construct the expected prefix based on current selections
        // This needs to handle the base part accurately before modifiers
        const namePartLower = selectedParts.name.toLowerCase();
        const basePrefix = `gemini-${selectedParts.version}-${namePartLower}`;

        allModelsInfo.forEach(model => {
            // Check if the model ID *starts with* the base prefix OR *is* a specific mapped ID
             // Handle edge cases like 'gemini-2.5-pro-exp-03-25' which maps to null modifier
             let matchesPrefix = model.value.startsWith(basePrefix);
             if (selectedParts.version === "2.5" && selectedParts.name === "Pro" && model.value === 'gemini-2.5-pro-exp-03-25') {
                matchesPrefix = true; // Consider this specific ID as matching the "Pro" selection for filtering purposes
             }


            if (matchesPrefix) {
                const displayModifier = getDisplayModifierFromModelId(model.value);
                // Check if the determined modifier is one we know about
                 if (displayModifier !== undefined && allPossibleModifiers.includes(displayModifier)) {
                    validModifiers.add(displayModifier);
                 }
            }
        });

        // Ensure '(None)' (null) is only added if it's actually possible for the combo
        if (!validModifiers.has(null) && allPossibleModifiers.includes(null)) {
             // Check if the base ID itself (without suffix) is a valid model OR if a special case maps to null
             const baseId = `gemini-${selectedParts.version}-${namePartLower}`;
             const baseIdExists = allModelsInfo.some(m => m.value === baseId);
             const specialNullCaseExists = (selectedParts.version === "2.5" && selectedParts.name === "Pro" && allModelsInfo.some(m => m.value === 'gemini-2.5-pro-exp-03-25'));

             if (baseIdExists || specialNullCaseExists) {
                 // Only add null if it corresponds to a real model combination
                 // validModifiers.add(null); // Let the main loop handle adding based on getDisplayModifierFromModelId
             } else {
                 // If null was incorrectly added by the loop and isn't valid, remove it?
                 // The current logic relies on getDisplayModifierFromModelId being correct.
             }
        }


        console.log("Available modifiers for", selectedParts, ":", Array.from(validModifiers));
        return Array.from(validModifiers);

    }, [selectedParts.version, selectedParts.name, allModelsInfo]);

    // --- Event Handlers ---

    const handlePartSelect = (partType: keyof SelectedParts, value: string | null) => {
        const isDeselecting = selectedParts[partType] === value;
        const newSelectedParts = { ...selectedParts };

        if (isDeselecting) {
            newSelectedParts[partType] = null;
            // When deselecting, reset subsequent parts if they become invalid
            if (partType === 'version') {
                newSelectedParts.name = null;
                newSelectedParts.modifier = null;
            } else if (partType === 'name') {
                newSelectedParts.modifier = null;
            }
        } else {
            newSelectedParts[partType] = value;
             // When selecting, reset subsequent parts as their validity changes
             if (partType === 'version') {
                 newSelectedParts.name = null; // Force re-selection of name
                 newSelectedParts.modifier = null;
             } else if (partType === 'name') {
                 newSelectedParts.modifier = null; // Force re-selection of modifier
             }
        }

        setSelectedParts(newSelectedParts);
        setMessage("Select one part from each required column."); // Reset message
        setStatus('selecting');
    };

    const handleBuildAttempt = () => {
        // Use the helper function to get the final ID based on selections
        const potentialModelId = getModelIdFromParts(selectedParts, allModelsInfo);

        // Check if mandatory parts are selected AND a valid ID was formed
        if (!selectedParts.version || !selectedParts.name ) {
            setStatus('error');
            setMessage("Please select at least a Version and a Name.");
            return;
        }

         if (!potentialModelId) {
             setStatus('error');
             // Give a more specific error if parts selected but combo invalid
             setMessage("Invalid combination! Those parts don't make a known model. Try again.");
             return; // Stop here if combo is invalid
         }

        setStatus('checking');
        setMessage("Checking combination...");

        // Use setTimeout to allow UI update for "checking..." message
        setTimeout(() => {
            // We already know potentialModelId is valid from the check above
            const isRestricted = restrictedModels.includes(potentialModelId);
            const hasValidKey = keyStatus.isValid === true;

            if (isRestricted && !hasValidKey) {
                setStatus('error');
                setMessage(`Model '${potentialModelId}' requires a valid Access Key! Try another combo or enter key.`);
            } else {
                setStatus('success');
                const modelLabel = allModelsInfo.find(m => m.value === potentialModelId)?.label || potentialModelId;
                setMessage(`Model selected: ${modelLabel}!`);
                onModelSelected(potentialModelId);
                setTimeout(onClose, 1500); // Close modal after success message
            }
        }, 300); // Short delay for "checking" message
    };

    // --- Render Logic ---

    if (!isOpen) return null;

    // Determine if build button should be enabled (all required parts selected)
    const canBuild = selectedParts.version !== null && selectedParts.name !== null;

    return (
        <div className="model-builder-overlay" onClick={onClose}>
            <div className="model-builder-modal" onClick={(e) => e.stopPropagation()}>
                <h4>Build Your AI Model</h4>
                <p className={`game-message ${status}`}>{message || " "}</p>

                <div className="model-parts-container">
                    {/* Column 1: Version */}
                    <div className="model-part-column">
                        <h5>Version *</h5>
                        {/* Iterate over ALL possible versions */}
                        {allPossibleVersions.map(v => (
                            <button
                                key={`v-${v}`}
                                onClick={() => handlePartSelect('version', v)}
                                className={`part-button ${selectedParts.version === v ? 'selected' : ''}`}
                                // Versions are always assumed to be selectable initially
                            >{v}</button>
                        ))}
                    </div>

                    {/* Column 2: Name */}
                    <div className="model-part-column">
                        <h5>Name *</h5>
                        {/* Iterate over ALL possible names */}
                        {allPossibleNames.map(n => {
                            // Check if this name is available based on selected version
                            const isDisabled = !availableNames.includes(n) && selectedParts.version !== null;
                             return (
                                <button
                                    key={`n-${n}`}
                                    onClick={() => handlePartSelect('name', n)}
                                    className={`part-button ${selectedParts.name === n ? 'selected' : ''}`}
                                    disabled={isDisabled} // Disable if not in the calculated availableNames
                                >{n}</button>
                            );
                        })}
                    </div>

                    {/* Column 3: Modifier */}
                    <div className="model-part-column">
                        <h5>Modifier / Feature</h5>
                        {/* Iterate over ALL possible modifiers */}
                        {allPossibleModifiers.map(m => {
                             // Check if this modifier is available based on selected version & name
                             const isDisabled = !availableModifiers.includes(m) && (selectedParts.version !== null || selectedParts.name !== null);
                             return (
                                <button
                                    key={`m-${m === null ? 'none' : m}`}
                                    onClick={() => handlePartSelect('modifier', m)}
                                    className={`part-button ${selectedParts.modifier === m ? 'selected' : ''}`}
                                    disabled={isDisabled} // Disable if not in the calculated availableModifiers
                                >
                                    {m === null ? '(None)' : m} {/* Display (None) for null */}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="model-builder-actions">
                    <button
                        onClick={handleBuildAttempt}
                        className="build-button"
                        // Disable build if not selecting, OR if required parts missing
                        disabled={status !== 'selecting' || !canBuild}
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