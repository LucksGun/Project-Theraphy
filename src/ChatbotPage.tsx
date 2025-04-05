// src/ChatbotPage.tsx - Corrected with Input Area restored and nextSibling fix
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage, Persona } from './App'; // Assuming App.tsx exports these types
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // For GitHub Flavored Markdown (tables, strikethrough, etc.)

// --- Constants ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Make sure this matches App.tsx
const SEND_COOLDOWN_MS = 2000; // Cooldown period in milliseconds (e.g., 2 seconds)
const MAX_HISTORY = 20; // Max number of past messages (user + bot) to send as history (adjust as needed)
const MAX_IMAGE_SIZE_MB = 3.8;

// Define the structure for history items sent to the worker
type HistoryItem = {
    role: 'user' | 'model'; // Gemini uses 'model' for bot responses
    parts: { text: string }[]; // Simple text parts for history
}

// --- Helper Functions ---
function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string); // reader.result is the Data URL (includes base64)
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

// Function to call the backend worker
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    persona: Persona,
    accessKey: string
): Promise<{ text: string; imageUrl: string | null; modelUsed?: string; username?: string }> { // Include potential fields from worker response

    const promptToSend = userInput || (imageData ? "Describe this image." : ""); // Default prompt if only image
    if (!promptToSend && !imageData) {
        // This case should ideally be prevented by the UI disabling send
        return { text: "Error: Cannot send empty message.", imageUrl: null };
    }

    const requestBody: {
        action: 'chat'; // Explicitly set action
        prompt: string;
        model: GeminiModel;
        persona: Persona;
        imageMimeType?: string;
        imageDataUrl?: string; // Send the full Data URL
        accessKey?: string;
        history?: HistoryItem[];
    } = {
        action: 'chat',
        prompt: promptToSend,
        model: model,
        persona: persona,
        accessKey: accessKey || undefined, // Send key only if provided
        history: history, // Send formatted history
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl; // Send the Data URL directly
    }

    console.log(`Sending Chat Request (Model: ${model}, Persona: ${persona}, History: ${history.length}, Image: ${!!imageData})`);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json().catch(() => {
            // Handle cases where the response isn't valid JSON
            console.error("Received non-JSON response status:", response.status, response.statusText);
            return { error: `Server error: Received invalid response format (Status: ${response.status})` };
        });

        // Check response status *after* trying to parse JSON, as errors might be in JSON body
        if (!response.ok) {
            throw new Error(responseData?.error || `API Error: ${response.status} ${response.statusText}`);
        }

        // Check for application-level errors returned in the JSON payload
        if (responseData.error) {
            throw new Error(responseData.error);
        }

        console.log('Received response from Worker:', responseData);
        return {
            text: responseData.reply || 'Received empty reply from bot.',
            imageUrl: responseData.imageUrl || null, // Handle potential image URL in response
            modelUsed: responseData.modelUsed,   // Capture model used if sent back
            username: responseData.username,   // Capture username if sent back (though likely handled in App.tsx)
        };

    } catch (error) {
        console.error('Error fetching bot response:', error);
        const errorMessage = error instanceof Error ? `Error: ${error.message}` : 'An unknown error occurred while fetching the response.';
        return { text: errorMessage, imageUrl: null };
    }
}

// Function to parse suggestions like [Suggestion: text] from bot response
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    if (!text) return { mainText: '', suggestions: [] };
    const suggestions: string[] = [];
    const suggestionRegex = /\[Suggestion:\s*([\s\S]+?)\s*\]/g;
    let lastIndex = 0;
    const textParts: string[] = [];
    let match;

    while ((match = suggestionRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            textParts.push(text.substring(lastIndex, match.index));
        }
        // Add the captured suggestion text
        if (match[1]) {
            suggestions.push(match[1].trim());
        }
        lastIndex = suggestionRegex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < text.length) {
        textParts.push(text.substring(lastIndex));
    }

    // Join the non-suggestion parts to get the main text
    const mainText = textParts.join('').trim();

    return { mainText, suggestions };
}

// Function to format timestamp into HH:MM format
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
        console.error("Timestamp formatting error:", e);
        return '';
    }
}

// --- Speech Recognition Setup ---
// Check for browser compatibility
const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
if (!recognitionAvailable) {
    console.warn("Browser does not support Speech Recognition.");
}

// --- Component Props Interface ---
interface ChatbotPageProps {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    selectedModel: GeminiModel;
    sttLang: SpeechLanguage; // Speech-to-text language
    selectedPersona: Persona;
    accessKey: string; // User's unique access key
}

// --- ChatbotPage Component ---
function ChatbotPage({
    messages,
    setMessages,
    selectedModel,
    sttLang,
    selectedPersona,
    accessKey // Receive access key as prop
}: ChatbotPageProps) {

    // --- State ---
    const [input, setInput] = useState<string>(''); // Current text in input field
    const [isLoading, setIsLoading] = useState<boolean>(false); // True when waiting for bot response
    const [selectedImage, setSelectedImage] = useState<File | null>(null); // File object for image upload
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null); // URL for image preview
    const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false); // True during send cooldown period
    const [isRecording, setIsRecording] = useState<boolean>(false); // True when microphone is active

    // --- Refs ---
    const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for send cooldown
    const recognitionRef = useRef<SpeechRecognition | null>(null); // Speech recognition instance
    const messagesEndRef = useRef<HTMLDivElement>(null); // Ref to scroll to bottom of messages
    const fileInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden file input

    // --- Effects ---

    // Scroll to bottom when new messages are added
    const scrollToBottom = useCallback(() => {
        // Use timeout to ensure DOM has updated
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100); // Small delay might be needed
    }, []); // No dependencies needed for the function itself

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]); // Run when messages change

    // Clean up image preview URL when component unmounts or image changes
    useEffect(() => {
        return () => {
            if (imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [imagePreviewUrl]);

    // Clean up cooldown timer on unmount
    useEffect(() => {
        return () => {
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
            }
        };
    }, []);

    // Initialize Speech Recognition
    useEffect(() => {
        if (!recognitionAvailable) return;

        // Initialize only once
        if (!recognitionRef.current) {
            try {
                recognitionRef.current = new SpeechRecognitionImpl();
                if (!recognitionRef.current) {
                     console.error("Failed to create SpeechRecognition instance.");
                     return; // Exit if instance creation failed
                }
                recognitionRef.current.continuous = false; // Stop after first recognized phrase
                recognitionRef.current.interimResults = false; // We only want final results

                recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                    const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                    if (transcript) {
                        setInput(prevInput => prevInput + transcript); // Append transcript to input
                    }
                    setIsRecording(false); // Recognition finished
                };

                recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech Recognition Error:', event.error, event.message);
                    let errorMessage = `Speech error: ${event.error}`;
                    if (event.error === 'no-speech') {
                        errorMessage = "No speech detected. Please try speaking clearly.";
                    } else if (event.error === 'audio-capture') {
                        errorMessage = "Microphone error. Check if it's connected and enabled.";
                    } else if (event.error === 'not-allowed') {
                        errorMessage = "Microphone permission denied. Please allow access in browser settings.";
                    } else {
                        errorMessage += ` - ${event.message || 'Unknown error'}`;
                    }
                    alert(errorMessage);
                    setIsRecording(false); // Stop recording state on error
                };

                recognitionRef.current.onstart = () => {
                    setIsRecording(true); // Set recording state when starting
                };

                recognitionRef.current.onend = () => {
                    setIsRecording(false); // Reset recording state when it ends naturally or via stop()
                };

            } catch (err) {
                console.error("Failed to initialize speech recognition:", err);
                recognitionRef.current = null; // Ensure ref is null if init fails
                alert("Speech recognition could not be initialized on this browser.");
            }
        }

        // Cleanup function for speech recognition
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort(); // Stop recognition if active
                } catch(e){
                    console.warn("Error aborting speech recognition:", e);
                }
                 // Remove listeners to prevent memory leaks (optional, but good practice)
                 recognitionRef.current.onresult = null;
                 recognitionRef.current.onerror = null;
                 recognitionRef.current.onstart = null;
                 recognitionRef.current.onend = null;
            }
            setIsRecording(false); // Ensure recording state is false on unmount/cleanup
        };
    }, []); // Run only once on mount

    // --- Core Send Logic ---
    const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
        const textTrimmed = messageText.trim();

        // Prevent sending empty messages or spamming
        if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) {
             if (isOnCooldown) console.log("Send cancelled: Cooldown active.");
             if (isLoading) console.log("Send cancelled: Already loading response.");
             if (!textTrimmed && !imageFile) console.log("Send cancelled: No text or image.");
            return;
        }

        const timestamp = Date.now();
        const imageToSend = imageFile; // Keep track of the image being sent
        let imageDataForApi: { type: string; dataUrl: string } | null = null;

        // Prepare message history for the backend
         // Convert local messages to the history format expected by the worker
         const historyToSend: HistoryItem[] = messages
             .filter(m => (m.sender === 'user' || m.sender === 'bot') && m.text) // Only user/bot with text
             .slice(-MAX_HISTORY) // Get the last MAX_HISTORY messages
             .map(m => ({
                 role: m.sender === 'user' ? 'user' : 'model', // Map sender to role
                 parts: [{ text: m.text }] // Structure text into parts
             }));


        // Add user message to UI immediately
        const userMessageText = textTrimmed + (imageToSend ? " (Image Attached)" : ""); // Indicate image attachment
        const userMsg: Message = { id: timestamp, text: userMessageText, sender: 'user', timestamp: timestamp };
        setMessages(prev => [...prev, userMsg]);

        // Clear input and image preview *after* adding user message to state
        if (messageText === input) setInput(''); // Clear input field only if it was the source
        if (imageToSend && imageToSend === selectedImage) {
            // Clear selected image state *and* the file input value
             setSelectedImage(null);
             setImagePreviewUrl(null); // This triggers useEffect cleanup for the blob URL
             if (fileInputRef.current) {
                 fileInputRef.current.value = ""; // Reset file input so same file can be selected again
             }
        }

        // Set loading and cooldown states
        setIsLoading(true);
        setIsOnCooldown(true);
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); // Clear any existing cooldown timer
        cooldownTimerRef.current = setTimeout(() => setIsOnCooldown(false), SEND_COOLDOWN_MS);

        // Add loading indicator message
        const loadingTimestamp = Date.now() + 1; // Ensure unique ID
        const loadingMsg: Message = { id: loadingTimestamp, text: 'Bot is thinking...', sender: 'loading', timestamp: loadingTimestamp };
        setMessages(prev => [...prev, loadingMsg]);
        scrollToBottom(); // Scroll after adding loading message

        // Process image if included
        if (imageToSend) {
            try {
                 // Basic validation (redundant with file input accept, but good safeguard)
                if (!imageToSend.type.startsWith('image/')) throw new Error("Invalid file type. Please upload an image.");
                 // Size check (already done in handler, but check again)
                 if (imageToSend.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) throw new Error(`Image size exceeds ${MAX_IMAGE_SIZE_MB}MB limit.`);

                const base64DataUrl = await readFileAsBase64(imageToSend);
                imageDataForApi = { type: imageToSend.type, dataUrl: base64DataUrl };
            } catch (e) {
                console.error("Error processing image:", e);
                const errorTimestamp = Date.now() + 2;
                const errorMsgText = `Image Error: ${e instanceof Error ? e.message : 'Could not process image.'}`;
                const errorMsg: Message = { id: errorTimestamp, text: errorMsgText, sender: 'bot', timestamp: errorTimestamp };
                // Replace loading message with error message
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), errorMsg]);
                setIsLoading(false);
                 // Reset cooldown immediately on image processing error? Maybe not, user might retry quickly.
                 // setIsOnCooldown(false);
                 // if(cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
                return; // Stop execution
            }
        }

        // Call the backend API function
        let botResponse: { text: string; imageUrl: string | null; modelUsed?: string; username?: string } = {
             text: 'Error: Failed to get response.', imageUrl: null
        }; // Default error response

        try {
            botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey);
        } catch (error) {
             // Catch errors specifically from the getBotResponse function's fetch/network layer (less likely now with internal try/catch)
            console.error("Critical error during API call execution:", error);
            botResponse.text = error instanceof Error ? `Error: ${error.message}` : "A critical network error occurred.";
        } finally {
             // This block runs whether the try succeeded or failed
            setIsLoading(false); // Turn off loading indicator

            const botTimestamp = Date.now() + 2; // Ensure unique ID
            const newBotMessage: Message = {
                id: botTimestamp,
                text: botResponse.text,
                sender: 'bot',
                timestamp: botTimestamp,
                imageUrl: botResponse.imageUrl ?? undefined, // Use undefined if null
                modelUsed: botResponse.modelUsed, // Include model used if available
            };

            // Replace loading message with the actual bot response (or error message)
            setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), newBotMessage]);
             // scrollToBottom(); // Scrolling is handled by the useEffect watching [messages]
        }

    }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey, scrollToBottom]); // Include all dependencies

    // --- Event Handlers ---
    const handleSend = () => {
        sendMessage(input, selectedImage); // Send current input text and selected image
    };

    const handleSuggestionClick = useCallback((suggestionText: string) => {
         // Send the suggestion text directly, without any image
        sendMessage(suggestionText, null);
    }, [sendMessage]); // Depends on the sendMessage callback

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { // Allow TextArea if you switch
        setInput(event.target.value);
    };

    // Handle Enter key press in input field
    const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            event.preventDefault(); // Prevent default form submission or newline
            handleSend();
        }
    };

    // Handle image selection from file input
    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Validate type
            if (!file.type.startsWith('image/')) {
                alert("Invalid file type. Please select an image (e.g., JPG, PNG, GIF, WEBP).");
                if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
                return;
            }
            // Validate size
            if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
                alert(`Image is too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.`);
                if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
                return;
            }

            // Set state and create preview URL
            setSelectedImage(file);
            if (imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl); // Clean up previous preview URL
            }
            setImagePreviewUrl(URL.createObjectURL(file));
        } else {
             // No file selected (e.g., user cancelled)
             // Optionally clear existing selection if needed, or just do nothing
             // setSelectedImage(null);
             // setImagePreviewUrl(null);
             // if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Trigger the hidden file input when the upload button is clicked
    const handleImageUploadClick = () => {
        fileInputRef.current?.click();
    };

    // Remove the selected image preview
    const removeSelectedImage = () => {
        setSelectedImage(null);
        setImagePreviewUrl(null); // This triggers useEffect cleanup
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; // Reset file input
        }
    };

    // Handle microphone button click
    const handleMicClick = () => {
        if (!recognitionRef.current || !recognitionAvailable) {
            alert("Speech recognition is not available or not initialized on this browser.");
            return;
        }
        // Prevent starting mic if loading response or on cooldown
        if (isLoading || isOnCooldown) return;

        if (isRecording) {
            try {
                recognitionRef.current.stop(); // Attempt to stop recording
                console.log("Speech recognition stopped manually.");
            } catch (e) {
                console.warn("Error stopping speech recognition:", e);
                 // Force state update if stop() fails silently
                 setIsRecording(false);
            }
        } else {
            try {
                recognitionRef.current.lang = sttLang; // Set the language dynamically
                recognitionRef.current.start(); // Start recording
                 console.log(`Speech recognition started with lang: ${sttLang}`);
            } catch (e) {
                 // Handle potential errors during start, e.g., service busy
                 if (e instanceof DOMException && e.name === 'InvalidStateError') {
                     // This can happen if start() is called too quickly after stop()
                     alert("Please wait a moment before starting the microphone again.");
                 } else {
                     console.error("Error starting speech recognition:", e);
                     alert("Could not start microphone. Please check permissions or try again.");
                 }
                 setIsRecording(false); // Ensure recording state is false if start fails
            }
        }
    };

    // --- JSX Rendering ---
    return (
        <div className="chatbot-page"> {/* Use a specific class for the page */}
            <div className="chatbot-messages">
                {messages.map((message: Message) => {
                    let mainText = message.text;
                    let suggestions: string[] = [];

                    // Parse suggestions only for non-error bot messages with text
                    if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) {
                        const parsed = parseSuggestions(mainText);
                        mainText = parsed.mainText;
                        suggestions = parsed.suggestions;
                    }

                    return (
                        <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                            <div className={`message ${message.sender}`}>
                                {message.sender === 'bot' ? (
                                    <>
                                        {/* Render Markdown content if it's not an error and has text */}
                                        {mainText && !message.text.startsWith('Error:') && (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText} />
                                        )}
                                        {/* Render image if URL exists */}
                                        {message.imageUrl && (
                                            <img
                                                src={message.imageUrl}
                                                alt="Bot response"
                                                className="bot-image" // Add class for styling
                                                style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText ? '8px' : '0px', borderRadius: '8px', cursor: 'pointer' }}
                                                onClick={() => window.open(message.imageUrl, '_blank')}
                                                onError={(e) => { // <<< FIX APPLIED HERE
                                                    console.warn(`Failed to load image: ${message.imageUrl}`);
                                                    // Assert the type once and store it
                                                    const imgElement = e.target as HTMLImageElement;
                                                    imgElement.style.display = 'none'; // Hide broken image
                                                    // Optionally add a placeholder text
                                                    const errorText = document.createElement('span');
                                                    errorText.textContent = '[Image failed to load]';
                                                    errorText.style.fontSize = '0.8em';
                                                    errorText.style.color = 'grey';
                                                    errorText.style.display = 'block';
                                                    errorText.style.marginTop = '4px';
                                                    // Use the typed variable here
                                                    imgElement.parentNode?.insertBefore(errorText, imgElement.nextSibling);
                                                }}
                                            />
                                        )}
                                        {/* Display placeholder if bot message has no text and no image (and isn't an error) */}
                                        {!mainText && !message.imageUrl && !message.text.startsWith('Error:') && (
                                            <i>[Empty bot response]</i>
                                        )}
                                        {/* Display error messages clearly */}
                                        {message.text && message.text.startsWith('Error:') && (
                                            <p className="error-message">{message.text}</p> // Use class for styling errors
                                        )}
                                    </>
                                ) : message.sender === 'loading' ? (
                                    <i>{message.text}</i> // Loading indicator
                                ) : (
                                    // User message: Display text preserving whitespace
                                    <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                                )}
                            </div>
                            {/* Timestamp for user and bot messages */}
                            {message.sender !== 'loading' && message.timestamp && (
                                <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                            )}
                            {/* Render suggestions if any */}
                            {suggestions.length > 0 && (
                                <div className="suggestions-container">
                                    {suggestions.map((s, i) => (
                                        <button
                                            key={`${message.id}-suggestion-${i}`}
                                            className="suggestion-button"
                                            onClick={() => handleSuggestionClick(s)}
                                            disabled={isLoading || isOnCooldown} // Disable buttons while loading/cooldown
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {/* Div used to scroll to the bottom */}
                <div ref={messagesEndRef} style={{ height: '1px' }} />
            </div>

             {/* Input Area - Restored */}
             <div className="chatbot-input-area">
                 {/* Image Preview Area */}
                 {imagePreviewUrl && (
                     <div className="image-preview-area">
                         <img src={imagePreviewUrl} alt="Selected preview" className="image-preview-thumbnail" />
                         <button onClick={removeSelectedImage} title="Remove selected image" className="remove-image-button">×</button>
                     </div>
                 )}
                 {/* Hidden File Input */}
                 <input
                     type="file"
                     ref={fileInputRef}
                     style={{ display: 'none' }}
                     accept="image/png, image/jpeg, image/gif, image/webp" // Specify acceptable image types
                     onChange={handleImageChange}
                 />
                 {/* Image Upload Button */}
                 <button onClick={handleImageUploadClick} className="input-button image-upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>
                     📎 {/* Use an appropriate icon */}
                 </button>
                 {/* Text Input Field */}
                 <input // Changed to input, use textarea if multiline is desired
                     type="text"
                     className="chatbot-input"
                     value={input}
                     onChange={handleInputChange}
                     onKeyPress={handleKeyPress}
                     placeholder={isLoading ? "Waiting for response..." : "Type your message or upload image..."}
                     disabled={isLoading || isOnCooldown} // Disable input while loading/cooldown
                     aria-label="Chat input"
                 />
                  {/* Microphone Button */}
                  {recognitionAvailable && ( // Only show mic if supported
                      <button
                          onClick={handleMicClick}
                          className={`input-button mic-button ${isRecording ? 'recording' : ''}`}
                          title={isRecording ? "Stop Recording" : "Start Speech-to-Text"}
                          disabled={isLoading || isOnCooldown} // Disable during loading/cooldown
                      >
                          {isRecording ? '🛑' : '🎤'}
                      </button>
                  )}
                 {/* Send Button */}
                 <button
                     onClick={handleSend}
                     className="send-button"
                     disabled={(!input.trim() && !selectedImage) || isLoading || isOnCooldown} // Disable if no input/image or loading/cooldown
                     title="Send Message"
                 >
                     Send {/* Or use an icon like ➤ */}
                 </button>
             </div> {/* End chatbot-input-area */}
        </div> // End chatbot-page
    );
}

export default ChatbotPage;