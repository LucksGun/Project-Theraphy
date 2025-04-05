// src/ChatbotPage.tsx - SIMPLIFIED for debugging - Only displays messages

import React, { useRef, useEffect, useCallback } from 'react';
import { Message } from './App'; // Assuming Message is still exported from App.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Helper Functions --- (Keep only necessary ones)
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { console.error("Time format error:", e); return ''; }
}

function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = []; const regex = /\[Suggestion:\s*([\s\S]+?)\s*\]/g; let lastIndex = 0; const parts: string[] = []; let match;
    while ((match = regex.exec(text)) !== null) { if (match.index > lastIndex) { parts.push(text.substring(lastIndex, match.index)); } if (match[1]) { suggestions.push(match[1].trim()); } lastIndex = regex.lastIndex; }
    if (lastIndex < text.length) { parts.push(text.substring(lastIndex)); } const mainText = parts.join('').trim(); return { mainText, suggestions };
}

// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  // Removed props that are no longer needed in this simplified version
  // setMessages, selectedModel, sttLang, selectedPersona, accessKey, setValidUsername, setLastKeyError
}


function ChatbotPage({ messages }: ChatbotPageProps) { // Removed unused props
  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for scrolling to bottom

  // --- Effects ---
  // Auto-scroll effect
  const scrollToBottom = useCallback(() => {
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);


  // --- JSX Rendering ---
  return (
      <div className="chatbot-container">
        {/* Messages Area */}
        <div className="chatbot-messages">
          {messages.map((message: Message) => {
              let mainText = message.text; let suggestions: string[] = [];
              // Still parse suggestions if they come back from the simplified worker
              if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) { const parsed = parseSuggestions(mainText); mainText = parsed.mainText; suggestions = parsed.suggestions; }

              return (
                <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                    {message.sender === 'bot' ? (<> {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && ( <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/> )} {message.imageUrl && ( <img src={message.imageUrl} alt="Bot response" style={{ maxWidth:'100%',maxHeight:'350px',display:'block',marginTop:mainText&&mainText.trim()!==''?'8px':'0px',borderRadius:'8px',cursor:'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> )} {!(mainText && mainText.trim()!=='') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && (<i>[Empty]</i>)} {message.text && message.text.startsWith('Error:') && (<p style={{color:'var(--remove-button-bg,red)'}}>{message.text}</p>)} </>)
                     : message.sender === 'loading' ? (<i>{message.text}</i>)
                     : (<p style={{whiteSpace:'pre-wrap'}}>{message.text}</p>)}
                  </div>
                  {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp">{formatTime(message.timestamp)}</span> )}
                  {/* Display modelUsed from simplified worker if needed for debug */}
                  {message.sender === 'bot' && message.modelUsed && (<span className="message-timestamp" style={{marginLeft: '10px', color: '#aaa'}}>(M: {message.modelUsed})</span>)}

                  {/* Remove suggestion button functionality for simplicity if desired */}
                  {/* {suggestions.length > 0 && ( <div className="suggestions-container"> {suggestions.map((s, i)=>( <button key={`${message.id}-s-${i}`} className="suggestion-button"> {s} </button> ))} </div> )} */}
                </div> );
          })}
          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>
         {/* Input area is now handled directly in App.tsx */}
      </div>
    );
}

export default ChatbotPage;