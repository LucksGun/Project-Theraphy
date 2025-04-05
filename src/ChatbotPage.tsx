// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage, Persona } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

type HistoryItem = { sender: 'user' | 'bot'; text: string; }

// Helper Functions
function readFileAsBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file); }); }

async function getBotResponse( userInput: string, imageData: { type: string; dataUrl: string } | null, history: HistoryItem[], model: GeminiModel, persona: Persona, accessKey: string ): Promise<{ text: string; imageUrl: string | null; modelUsed?: string; username?: string }> {
    const promptToSend = userInput || (imageData ? "Describe image." : ""); if (!promptToSend && !imageData) { return { text: "Please type a message or upload an image.", imageUrl: null }; }
    const requestBody: { prompt: string; model: GeminiModel; persona: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; history?: HistoryItem[]; action?: 'chat' | 'validateKey'; } = { prompt: promptToSend, model: model, persona: persona, accessKey: accessKey, history: history, action: 'chat' }; // Specify action: 'chat'
    if (imageData) { requestBody.imageMimeType = imageData.type; requestBody.imageDataUrl = imageData.dataUrl; }
    console.log(`Sending Chat Request (M: ${model}, P: ${persona}, H: ${history.length})`);
    try {
        const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(requestBody), });
        const responseData = await response.json().catch(() => ({ error: `Invalid JSON response. Status: ${response.status}` }));
        if (!response.ok) { throw new Error(responseData?.error || `HTTP error! Status: ${response.status}`); }
        if (responseData.error) { throw new Error(responseData.error); }
        console.log('Received object from Worker:', responseData);
        return { text: responseData.reply || 'No reply.', imageUrl: responseData.imageUrl || null, modelUsed: responseData.modelUsed, username: responseData.username };
    } catch (error) { console.error('Fetch Err:', error); const msg = error instanceof Error ? `Error: ${error.message}` : 'Fetch failed.'; return { text: msg, imageUrl: null }; }
}

function parseSuggestions(text: string): { mainText: string; suggestions: string[] } { const suggestions: string[] = []; const regex = /\[Suggestion:\s*([\s\S]+?)\s*\]/g; let lastIndex = 0; const parts: string[] = []; let match; while ((match = regex.exec(text)) !== null) { if (match.index > lastIndex) { parts.push(text.substring(lastIndex, match.index)); } if (match[1]) { suggestions.push(match[1].trim()); } lastIndex = regex.lastIndex; } if (lastIndex < text.length) { parts.push(text.substring(lastIndex)); } const mainText = parts.join('').trim(); return { mainText, suggestions }; }
function formatTime(timestamp: number): string { if (!timestamp || typeof timestamp !== 'number') return ''; try { const date = new Date(timestamp); return date.toLocaleTimeString(navigator.language||'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { console.error("Time fmt err:", e); return ''; } }

// Speech Rec
const SpeechRecognitionImpl = window.SpeechRecognition || (window as any).webkitSpeechRecognition; const recognitionAvailable = !!SpeechRecognitionImpl;

// Component Props (Simplified)
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
  sttLang: SpeechLanguage;
  selectedPersona: Persona;
  accessKey: string; // User's unique key
}

const SEND_COOLDOWN_MS = 3000;

// Component
function ChatbotPage({ messages, setMessages, selectedModel, sttLang, selectedPersona, accessKey }: ChatbotPageProps) {
  // State
  const [input, setInput] = useState<string>(''); const [isLoading, setIsLoading] = useState<boolean>(false); const [selectedImage, setSelectedImage] = useState<File | null>(null); const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null); const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false); const [isRecording, setIsRecording] = useState<boolean>(false);
  // Refs
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null); const recognitionRef = useRef<SpeechRecognition | null>(null); const messagesEndRef = useRef<HTMLDivElement>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  // Effects
  const scrollToBottom = useCallback(() => { setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100); }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } }; }, [imagePreviewUrl]);
  useEffect(() => { return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } }; }, []);
  useEffect(() => { if (!recognitionAvailable) return; if (!recognitionRef.current) { try { recognitionRef.current = new SpeechRecognitionImpl(); if (!recognitionRef.current) return; recognitionRef.current.continuous = false; recognitionRef.current.interimResults = false; recognitionRef.current.onresult = (e: SpeechRecognitionEvent) => { const t = e.results[e.results.length-1]?.[0]?.transcript; if (t) setInput(t); setIsRecording(false); }; recognitionRef.current.onerror = (e: SpeechRecognitionErrorEvent) => { console.error('Speech Err:', e.error, e.message); let msg=`Speech error: ${e.error}`; if (e.error === 'no-speech') msg="No speech."; else if (e.error === 'audio-capture') msg="Mic error."; else if (e.error === 'not-allowed') msg="Mic permission denied."; else msg+=` - ${e.message||'Unknown'}`; alert(msg); setIsRecording(false); }; recognitionRef.current.onstart = () => { setIsRecording(true); }; recognitionRef.current.onend = () => { setIsRecording(false); }; } catch (err) { console.error("Fail init speech:", err); recognitionRef.current = null; } } return () => { if (recognitionRef.current?.onstart) { try { recognitionRef.current.abort(); } catch(e){ /*ignore*/ } } setIsRecording(false); }; }, []);

  // Core Send Logic
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim(); if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;
    const currentTime = Date.now(); const imageToSend = imageFile; let imageDataForApi: { type: string; dataUrl: string } | null = null;
    const MAX_HISTORY = 30; const history = messages.filter(m => (m.sender==='user'||m.sender==='bot')&&m.text).slice(-MAX_HISTORY); const historyToSend: HistoryItem[] = history.map(m => ({ sender: m.sender as 'user'|'bot', text: m.text }));
    const userMsg: Message = { id: currentTime, text: textTrimmed+(imageToSend?' (+img)':''), sender: 'user', timestamp: currentTime }; setMessages(prev => [...prev, userMsg]);
    if (imageToSend && imageToSend===selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; } if (messageText===input) setInput('');
    setIsLoading(true); setIsOnCooldown(true); if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = setTimeout(() => setIsOnCooldown(false), SEND_COOLDOWN_MS);
    const loadingTime = Date.now() + 1; const loadingMsg: Message = { id: loadingTime, text: 'Bot typing...', sender: 'loading', timestamp: loadingTime }; setMessages(prev => [...prev, loadingMsg]);
    if (imageToSend) { try { if (!imageToSend.type.startsWith('image/')) throw new Error("Invalid file."); const base64 = await readFileAsBase64(imageToSend); imageDataForApi = { type: imageToSend.type, dataUrl: base64 }; } catch (e) { console.error("Img read err:", e); const errTime=Date.now()+2; setMessages(prev => [ ...prev.filter(m => m.id !== loadingTime), { id: errTime, text: `Img Error: ${e instanceof Error ? e.message : 'Unknown'}`, sender: 'bot', timestamp: errTime }]); setIsLoading(false); setIsOnCooldown(false); if(cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); return; } }

    let botResponse: { text: string; imageUrl: string | null; modelUsed?: string; username?: string } = { text: 'Error: Response failed.', imageUrl: null };

    try { botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey); }
    catch (error) { console.error("Network/fetch error in sendMessage:", error); const errorMsg = error instanceof Error ? `Error: ${error.message}` : "Network error."; botResponse.text = errorMsg; }
    finally { setIsLoading(false); const botTime = Date.now() + 2; const newBotMessage: Message = { id: botTime, text: botResponse.text, sender: 'bot', timestamp: botTime, imageUrl: botResponse.imageUrl ?? undefined }; setMessages((prev => [ ...prev.filter(m => m.id !== loadingTime), newBotMessage ])); }
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey]); // Dependencies

  // Event Handlers
  const handleSend = () => { sendMessage(input, selectedImage); };
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]);
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file && file.type.startsWith('image/')) { const MAX=3.8; if(file.size>MAX*1024*1024){ alert(`Img too large (>${MAX}MB)`); if(fileInputRef.current)fileInputRef.current.value=""; return; } setSelectedImage(file); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(URL.createObjectURL(file)); } else { setSelectedImage(null); setImagePreviewUrl(null); if (file) alert("Invalid image type."); if (fileInputRef.current) fileInputRef.current.value = ""; } };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const handleMicClick = () => { if (!recognitionRef.current || !recognitionAvailable) return alert("Speech rec not available."); if (isLoading || isOnCooldown) return; if (isRecording) { try { recognitionRef.current.stop(); } catch(e){ console.warn("Stop speech err", e); } } else { try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { if (e instanceof DOMException && e.name === 'InvalidStateError') { alert("Wait before starting mic again."); } else { console.error("Start speech err:", e); alert("Mic start fail."); } setIsRecording(false); } } };

  // --- JSX Rendering ---
  return (
      <div className="chatbot-container">
        <div className="chatbot-messages">
          {messages.map((message: Message) => {
              let mainText = message.text; let suggestions: string[] = [];
              if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) { const parsed = parseSuggestions(mainText); mainText = parsed.mainText; suggestions = parsed.suggestions; }
              return (
                <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                    {message.sender === 'bot' ? (<> {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && ( <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/> )} {message.imageUrl && ( <img src={message.imageUrl} alt="Bot response" style={{ maxWidth:'100%',maxHeight:'350px',display:'block',marginTop:mainText&&mainText.trim()!==''?'8px':'0px',borderRadius:'8px',cursor:'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> )} {!(mainText && mainText.trim()!=='') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && (<i>[Empty]</i>)} {message.text && message.text.startsWith('Error:') && (<p style={{color:'var(--remove-button-bg,red)'}}>{message.text}</p>)} </>)
                     : message.sender === 'loading' ? (<i>{message.text}</i>)
                     : (<p style={{whiteSpace:'pre-wrap'}}>{message.text}</p>)}
                  </div>
                  {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp">{formatTime(message.timestamp)}</span> )}
                  {suggestions.length > 0 && ( <div className="suggestions-container"> {suggestions.map((s, i)=>( <button key={`${message.id}-s-${i}`} className="suggestion-button" onClick={()=>handleSuggestionClick(s)} disabled={isLoading || isOnCooldown}> {s} </button> ))} </div> )}
                </div> );
          })}
          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>
        {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl} alt="Preview" style={{maxHeight:'50px',maxWidth:'50px',objectFit:'cover',marginRight:'10px',borderRadius:'4px'}}/> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button> </div> )}
        <div className="chatbot-input-area">
          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{display:'none'}} />
          <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown} aria-label="Upload image">📎</button>
          <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type or speak..." disabled={isLoading || isOnCooldown} aria-label="Chat input" />
          {recognitionAvailable && ( <button onClick={handleMicClick} className={`mic-button ${isRecording?'recording':''}`} title={isRecording?"Stop":"Record"} disabled={isLoading || isOnCooldown} aria-label={isRecording?"Stop":"Record"}> {isRecording?'■':'🎙️'} </button> )}
          <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send" aria-label="Send message"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em" aria-hidden="true"> <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /> </svg> </button>
        </div>
      </div>
    );
}

export default ChatbotPage;