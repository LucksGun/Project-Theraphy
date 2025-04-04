// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure Message, GeminiModel, SpeechLanguage, and Persona are exported from App.tsx
import { Message, GeminiModel, SpeechLanguage, Persona } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL - Make sure this is correct
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Helper type for history formatting
type HistoryItem = {
  sender: 'user' | 'bot';
  text: string;
}

// --- Helper Functions ---

// Reads file as Base64
function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { resolve(reader.result as string); };
        reader.onerror = (error) => { reject(error); };
        reader.readAsDataURL(file);
    });
}

// Calls the Cloudflare Worker (Handles History, Image Response, and Persona)
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    persona: Persona, // Added persona
    accessKey: string
): Promise<{ text: string; imageUrl: string | null }> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return { text: "Please type a message or upload an image.", imageUrl: null };
    }

    const requestBody: {
        prompt: string;
        model: GeminiModel;
        persona: Persona; // Added persona
        imageMimeType?: string;
        imageDataUrl?: string;
        accessKey?: string;
        history?: HistoryItem[];
    } = {
        prompt: promptToSend,
        model: model,
        persona: persona, // Added persona
        accessKey: accessKey,
        history: history
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending Chat Request to Worker (Model: ${model}, Persona: ${persona}, History: ${history.length})`);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json(); // Expects { reply: string, imageUrl?: string | null }
        if (data.error) { throw new Error(data.error); }

        console.log('Received reply object from Worker:', data);
        // Return object, ensuring imageUrl is explicitly null if missing/falsy
        return {
            text: data.reply || 'Sorry, I received an empty reply.',
            imageUrl: data.imageUrl || null
        };

    } catch (error) {
        console.error('Error fetching bot response:', error);
        const errorMsg = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not fetch response.';
        return { text: errorMsg, imageUrl: null }; // Return object structure on error
    }
}

// Parses suggestions like [Suggestion: Text] from text
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = [];
    // Improved regex to handle potential variations in spacing
    const regex = /\[Suggestion:\s*([\s\S]+?)\s*\]/g;
    let lastIndex = 0;
    const parts: string[] = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        // Add the suggestion
        if (match[1]) {
            suggestions.push(match[1].trim());
        }
        // Update last index
        lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    // Join the non-suggestion parts back together
    const mainText = parts.join('').trim();

    return { mainText, suggestions };
}


// Formats timestamp e.g., "16:37"
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
      const date = new Date(timestamp);
      // Use Intl for more robust locale-aware formatting if needed in the future
      // const formatter = new Intl.DateTimeFormat(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      // return formatter.format(date);
      return date.toLocaleTimeString(navigator.language || 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false // Use 24-hour format consistently
      });
    } catch (e) {
      console.error("Error formatting time:", e);
      return '';
    }
}

// --- Speech Recognition Setup ---
// Check for vendor prefixes
const SpeechRecognitionImpl = window.SpeechRecognition || (window as any).webkitSpeechRecognition; // Use 'any' for webkit prefix temporarily
const recognitionAvailable = !!SpeechRecognitionImpl;


// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
  sttLang: SpeechLanguage;
  selectedPersona: Persona; // Receive selected persona
  accessKey: string;
}

const SEND_COOLDOWN_MS = 3000; // 3 seconds

function ChatbotPage({
    messages,
    setMessages,
    selectedModel,
    sttLang,
    selectedPersona, // Use selected persona
    accessKey
}: ChatbotPageProps) {
  // --- State ---
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // --- Refs ---
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for scrolling to bottom
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for hidden file input

  // --- Effects ---
  // Auto-scroll effect
  const scrollToBottom = useCallback(() => {
      // Use timeout to ensure scrolling happens after DOM update
      setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
  }, []); // No dependencies needed for the function itself

  useEffect(() => {
      // Scroll whenever messages array changes
      scrollToBottom();
  }, [messages, scrollToBottom]); // Depend on messages and the function

  // Image preview URL cleanup effect
  useEffect(() => {
      // This is a cleanup function that runs when the component unmounts
      // or when imagePreviewUrl changes before the next effect runs.
      return () => {
          if (imagePreviewUrl) {
              URL.revokeObjectURL(imagePreviewUrl); // Free memory
              // console.log("Revoked image preview URL:", imagePreviewUrl); // For debugging
          }
      };
  }, [imagePreviewUrl]); // Re-run only when imagePreviewUrl changes

  // Cooldown timer cleanup effect
  useEffect(() => {
      // Cleanup function runs on component unmount
      return () => {
          if (cooldownTimerRef.current) {
              clearTimeout(cooldownTimerRef.current);
          }
      };
  }, []); // Run only once on mount

  // Speech recognition initialization effect
  useEffect(() => {
      if (!recognitionAvailable) {
          console.warn("Speech Recognition not available in this browser.");
          return; // Exit if not supported
      }
      // Initialize only once
      if (!recognitionRef.current) {
          try {
              recognitionRef.current = new SpeechRecognitionImpl();
              if (!recognitionRef.current) return; // Double check instance creation

              recognitionRef.current.continuous = false; // Stop after first result
              recognitionRef.current.interimResults = false; // Only final results

              recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                  const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                  if (transcript) { setInput(transcript); } // Set input field with transcript
                  setIsRecording(false); // Turn off recording indicator
              };
              recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                  console.error('Speech recognition error:', event.error, event.message);
                  // Provide more informative errors
                  let errorMessage = `Speech error: ${event.error}`;
                  if (event.error === 'no-speech') {
                    errorMessage = "No speech detected. Please try again.";
                  } else if (event.error === 'audio-capture') {
                    errorMessage = "Microphone error. Ensure it's connected and permissions are granted.";
                  } else if (event.error === 'not-allowed') {
                    errorMessage = "Microphone permission denied. Please allow access in browser settings.";
                  } else {
                    errorMessage += ` - ${event.message || 'Unknown error'}`;
                  }
                  alert(errorMessage);
                  setIsRecording(false); // Turn off indicator on error
              };
              recognitionRef.current.onstart = () => {
                  setIsRecording(true); // Turn on indicator
              };
              recognitionRef.current.onend = () => {
                  setIsRecording(false); // Ensure indicator is off when recognition ends naturally or is aborted
              };
             console.log("Speech Recognition Initialized"); // Log successful init

          } catch (error) {
              console.error("Failed to initialize SpeechRecognition:", error);
              recognitionRef.current = null; // Ensure ref is null if init fails
          }
      }
      // Cleanup function to abort recognition if component unmounts while recording
      return () => {
          if (recognitionRef.current && recognitionRef.current.onstart) { // Check if recognition was likely active
              try {
                  recognitionRef.current.abort();
                  console.log("Aborted speech recognition on unmount/cleanup.");
               } catch(e){ console.warn("Error aborting speech recognition during cleanup", e); }
          }
          setIsRecording(false); // Ensure state is reset
      };
  }, []); // Empty dependency array ensures this runs only once on mount


  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    // Prevent sending if loading, on cooldown, or empty input without an image
    if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) {
        console.log("Send blocked:", {isLoading, isOnCooldown, textTrimmed: !!textTrimmed, imageFile: !!imageFile});
        return;
    }

    const currentTime = Date.now();
    const imageToSend = imageFile; // Use the passed argument
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // --- Prepare History ---
    const MAX_HISTORY_MESSAGES = 30; // Limit conversation history length
    const relevantHistory = messages
        .filter(msg => (msg.sender === 'user' || msg.sender === 'bot') && msg.text) // Ensure only valid messages with text
        .slice(-MAX_HISTORY_MESSAGES); // Get the last N messages

    const historyToSend: HistoryItem[] = relevantHistory.map(msg => ({
        sender: msg.sender as 'user' | 'bot',
        text: msg.text // Send original text for context
    }));

    // Create and add the user's message to the state immediately
    const newUserMessage: Message = {
      id: currentTime,
      text: textTrimmed + (imageToSend ? ' (+image)' : ''), // Add notation if image sent
      sender: 'user',
      timestamp: currentTime,
      imageUrl: undefined // User messages don't have images from the bot
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // --- Clear relevant state AFTER adding user message ---
    if (imageToSend && imageToSend === selectedImage) {
        // Clear image state only if it was the one actively selected for sending
        setSelectedImage(null);
        setImagePreviewUrl(null); // revokeObjectURL happens in useEffect cleanup
        if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    }
    if (messageText === input) { // Clear input field only if it was the source of the text
        setInput('');
    }

    // --- Set loading/cooldown state ---
    setIsLoading(true);
    setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
        setIsOnCooldown(false);
        // console.log("Cooldown ended"); // For debugging
    }, SEND_COOLDOWN_MS);

    // --- Add visual loading indicator ---
    const loadingTime = Date.now() + 1; // Ensure unique ID slightly after user message
    const loadingMessage: Message = { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime };
    setMessages((prevMessages) => [...prevMessages, loadingMessage]);

    // --- Process image if sending one ---
    if (imageToSend) {
      try {
        const base64String = await readFileAsBase64(imageToSend);
        imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
      } catch (error) {
        console.error("Error reading image file:", error);
        const errorTime = Date.now() + 2;
        // Replace loading message with error
        setMessages((prevMessages) => [
            ...prevMessages.filter(msg => msg.id !== loadingTime), // Remove loading message
            { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime }
        ]);
        setIsLoading(false);
        setIsOnCooldown(false); // Allow user to try again sooner
        if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); } // Clear cooldown if error
        return; // Stop if image processing failed
      }
    }

    // --- Get bot response ---
    let botResponse: { text: string; imageUrl: string | null } = { text: '', imageUrl: null };
    try {
      // Pass history, persona and other necessary data to the API call function
      botResponse = await getBotResponse(
          textTrimmed,
          imageDataForApi,
          historyToSend,
          selectedModel,
          selectedPersona, // Pass persona
          accessKey
      );
    } catch (error) {
      // Catch errors from getBotResponse itself (though it handles internally now)
      console.error("Error occurred during getBotResponse call:", error);
      const errorMsg = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
      botResponse = { text: errorMsg, imageUrl: null };
    } finally {
      // Ensure loading state is reset even if adding message fails somehow (shouldn't happen often)
      setIsLoading(false);

      const botTime = Date.now() + 2; // Ensure unique ID
      // Create the final bot message object using the response
      const newBotMessage: Message = {
          id: botTime,
          text: botResponse.text,
          sender: 'bot',
          timestamp: botTime,
          // Ensure type compatibility: assign null/string to string | undefined
          // Use nullish coalescing: if botResponse.imageUrl is null, assign undefined
          imageUrl: botResponse.imageUrl ?? undefined
      };
      // Replace loading message with the final bot message
      setMessages((prevMessages) => [
        ...prevMessages.filter(msg => msg.id !== loadingTime), // Remove loading message
        newBotMessage // Add final bot message
      ]);
      // Note: isLoading is reset *before* setting the message, could cause flicker? Resetting after is safer.
      // setIsLoading(false); // Moved this up to finally block start
    }
  // Add selectedPersona to dependency array as it's used in the API call
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey]); // Ensure all state/props used are listed


  // --- Event Handlers ---
  const handleSend = () => {
    // Call sendMessage with current input and selected image
    sendMessage(input, selectedImage);
  };

  // Use sendMessage directly in useCallback for suggestion click
  const handleSuggestionClick = useCallback((suggestionText: string) => {
      // Call sendMessage with suggestion text and no image
      sendMessage(suggestionText, null);
  }, [sendMessage]); // Depends only on the memoized sendMessage function

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    // Send message on Enter key press, unless Shift key is also held (for new lines)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent default form submission or newline insertion
      handleSend();
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && file.type.startsWith('image/')) {
          // Validate image size (e.g., < 4MB, typical free tier limit for Gemini)
          const MAX_SIZE_MB = 3.8;
          if (file.size > MAX_SIZE_MB * 1024 * 1024) {
              alert(`Image is too large (Max ${MAX_SIZE_MB} MB). Please select a smaller image.`);
              if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
              return;
          }

          setSelectedImage(file);
          // Create object URL for preview
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Clean up previous preview URL
          setImagePreviewUrl(URL.createObjectURL(file));
      } else {
          // Reset if no file or invalid file type
          setSelectedImage(null);
          setImagePreviewUrl(null);
          if (file) alert("Please select a valid image file (PNG, JPG, GIF, WEBP).");
          if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input value if invalid file selected
      }
  };

  const handleImageUploadClick = () => {
    // Programmatically click the hidden file input
    fileInputRef.current?.click();
  };

  const removeSelectedImage = () => {
      setSelectedImage(null);
      setImagePreviewUrl(null); // revokeObjectURL happens in useEffect cleanup
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input value
  };

  const handleMicClick = () => {
      if (!recognitionRef.current || !recognitionAvailable) {
          return alert("Speech recognition not initialized or not available in this browser.");
      }
      if (isLoading || isOnCooldown) {
          console.log("Mic blocked due to loading or cooldown.");
          return;
      }

      if (isRecording) {
          // If already recording, stop it
          try {
              recognitionRef.current.stop();
              console.log("Speech recognition stopped by user.");
          }
          catch(e){ console.warn("Error stopping speech recognition", e); }
          // onend handler should set isRecording to false
      } else {
          // If not recording, start it
          try {
              recognitionRef.current.lang = sttLang; // Set language from state
              recognitionRef.current.start();
              console.log("Speech recognition started for lang:", sttLang);
              // onstart handler should set isRecording to true
          } catch (e) {
              // Handle common errors like "InvalidState" if start() is called too soon after stop()
              if (e instanceof DOMException && e.name === 'InvalidStateError') {
                  console.warn("Attempted to start speech recognition too soon after stopping.");
                  // Optionally retry after a short delay, or just inform user
                  alert("Please wait a moment before starting recognition again.");
              } else {
                  console.error("Error starting speech recognition:", e);
                  alert("Could not start recognition. Please check microphone permissions and ensure no other app is using the mic.");
              }
              setIsRecording(false); // Ensure state is reset on error
          }
      }
  };


  // --- JSX Rendering ---
  return (
      <div className="chatbot-container">
        {/* Messages Area */}
        <div className="chatbot-messages">
          {messages.map((message: Message) => { // Use Message type from import
              let mainText = message.text;
              let suggestions: string[] = [];
              // Parse suggestions only for actual bot messages (that are not errors)
              if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) {
                const parsed = parseSuggestions(mainText);
                mainText = parsed.mainText; // Use text without suggestion tags for Markdown
                suggestions = parsed.suggestions;
              }

              return (
                <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  {/* Message Bubble */}
                  <div className={`message ${message.sender}`}>
                    {/* Bot Message Content */}
                    {message.sender === 'bot' ? (
                      <>
                        {/* Render Text if it exists and is not just whitespace or an error */}
                        {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/>
                        )}
                        {/* Render Image if imageUrl exists */}
                        {message.imageUrl && (
                          <img
                            src={message.imageUrl}
                            alt="Bot response"
                            style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText && mainText.trim() !== '' ? '8px' : '0px', borderRadius: '8px', cursor:'pointer' }}
                            onClick={() => window.open(message.imageUrl, '_blank')}
                            // Basic error handling for broken images
                            onError={(e) => {
                                console.warn("Failed to load image:", message.imageUrl);
                                e.currentTarget.style.display = 'none'; // Hide broken image icon
                                // Optionally add a placeholder text/icon here
                            }}
                          />
                        )}
                        {/* Handle case where bot response is valid but genuinely empty (no text, no image, not an error) */}
                        {!(mainText && mainText.trim() !== '') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && (
                            <i>[Empty response]</i>
                        )}
                        {/* Display error messages directly */}
                        {message.text && message.text.startsWith('Error:') && (
                            <p style={{color: 'var(--remove-button-bg, red)'}}>{message.text}</p> // Use error color
                        )}
                      </>
                    ) : message.sender === 'loading' ? (
                      // Loading Indicator
                      <i>{message.text}</i>
                    ) : (
                      // User Message - Render simple text, handle potential line breaks
                      <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                    )}
                  </div>
                  {/* Timestamp */}
                  {message.sender !== 'loading' && message.timestamp && (
                    <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                  )}
                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="suggestions-container">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={`${message.id}-suggestion-${index}`} // More unique key
                          className="suggestion-button"
                          onClick={() => handleSuggestionClick(suggestion)}
                          // Disable suggestions while loading/on cooldown
                          disabled={isLoading || isOnCooldown}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
          })}
          {/* Div for scrolling into view */}
          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>

        {/* Image Preview Area (when user selects image to send) */}
        {imagePreviewUrl && (
          <div className="image-preview-area">
            <img src={imagePreviewUrl} alt="Preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px', borderRadius: '4px'}} />
            <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
          </div>
        )}

        {/* Input Area */}
        <div className="chatbot-input-area">
          {/* Hidden file input */}
          <input
             type="file"
             ref={fileInputRef}
             onChange={handleImageChange}
             accept="image/png, image/jpeg, image/gif, image/webp" // Common image types
             style={{ display: 'none' }}
          />
          {/* Upload Button */}
          <button
             onClick={handleImageUploadClick}
             className="upload-button"
             title="Upload Image"
             disabled={isLoading || isOnCooldown}
             aria-label="Upload image"
           >
             📎
           </button>
          {/* Text Input */}
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type message or speak..."
            disabled={isLoading || isOnCooldown}
            aria-label="Chat input"
          />
          {/* Mic Button */}
          {recognitionAvailable && (
            <button
              onClick={handleMicClick}
              className={`mic-button ${isRecording ? 'recording' : ''}`}
              title={isRecording ? "Stop Recording" : `Start Recording (${sttLang})`}
              // Disable mic button if loading, on cooldown, but NOT if currently recording (allow stop)
              disabled={isLoading || isOnCooldown}
              aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
            >
              {isRecording ? '■' : '🎙️'}
            </button>
          )}
          {/* Send Button */}
          <button
            onClick={handleSend}
            // Disable if loading, on cooldown, OR if input is empty AND no image is selected
            disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)}
            title="Send message"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em" aria-hidden="true">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </div>
    );
}

export default ChatbotPage;