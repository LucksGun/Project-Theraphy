/**
 * JSDoc type definition for the Worker environment bindings and secrets.
 * @typedef {object} Env
 * @property {D1Database} USER_DB - Binding for the D1 Database.
 * @property {KVNamespace} CHAT_CONFIG_KV - Binding for the KV Namespace.
 * @property {string} FIREBASE_PROJECT_ID - Your Firebase Project ID.
 * @property {string} GEMINI_API_KEY - Secret for Google Gemini.
 * @property {string} GOOGLE_TTS_API_KEY - Secret for Google Cloud Text-to-Speech.
 * @property {string} GOOGLE_STT_API_KEY - Secret for Google Cloud Speech-to-Text.
 * @property {string} STAFF_ACCESS_KEY - Secret for admin access.
 * * @property {string} GOOGLE_SEARCH_API_KEY - ✨ NEW: Secret for Google Custom Search.
 * @property {string} GOOGLE_CX_ID - ✨ NEW: Secret for the Google Search Engine ID.
 * @property {string} INVOICE_ACCESS_PASSWORD - Secret for invoice/voucher API access.
 * * @property {string} OPENAI_API_KEY - Secret for OpenAI Realtime API.
 */

/**
 * Verifies a Firebase ID token using Google's public keys (JWKS).
 * This function acts as our security guard for Firebase logins.
 * @param {string} token - The Firebase ID token from the client.
 * @param {string} firebaseProjectId - Your Firebase project ID from env.
 * @returns {Promise<{success: boolean, payload?: any, error?: string}>}
 */

async function verifyFirebaseToken(token, firebaseProjectId) {

        if (!token) {
    
            return { success: false, error: 'No token provided.' };
    
        }
    
    
    
        try {
    
            const parts = token.split('.');
    
            if (parts.length !== 3) {
    
                return { success: false, error: 'Invalid token structure.' };
    
            }
    
            
    
            const [headerB64, payloadB64, signatureB64] = parts;
    
    
    
            // ✨ FIX: Helper function to correctly decode base64url
    
            const base64UrlDecode = (str) => {
    
                let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    
                while (base64.length % 4) {
    
                    base64 += '=';
    
                }
    
                return atob(base64);
    
            };
    
            
    
            // ✨ FIX: Use the helper function for header and payload
    
            const header = JSON.parse(base64UrlDecode(headerB64));
    
            const payload = JSON.parse(base64UrlDecode(payloadB64));
    
    
    
            // --- Check claims before cryptographic verification ---
    
            const now = Math.floor(Date.now() / 1000);
    
            if (payload.exp < now) {
    
                return { success: false, error: 'Token has expired.' };
    
            }
    
            if (payload.aud !== firebaseProjectId) {
    
                return { success: false, error: `Token audience is invalid. Expected ${firebaseProjectId}, got ${payload.aud}` };
    
            }
    
            if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    
                return { success: false, error: `Token issuer is invalid.` };
    
            }
    
    
    
            // --- Cryptographic verification using JWKS ---
    
            const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    
            if (!response.ok) {
    
                 throw new Error(`Failed to fetch Google's public keys (JWKS): ${response.statusText}`);
    
            }
    
            const jwks = await response.json();
    
            const jwk = jwks.keys.find(key => key.kid === header.kid);
    
    
    
            if (!jwk) {
    
                return { success: false, error: "Token's key ID (kid) is not valid." };
    
            }
    
            
    
            const cryptoKey = await crypto.subtle.importKey(
    
                'jwk',
    
                jwk,
    
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    
                false,
    
                ['verify']
    
            );
    
            
    
            const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    
            
    
            // ✨ FIX: Use the helper function for the signature as well
    
            const signature = Uint8Array.from(base64UrlDecode(signatureB64), c => c.charCodeAt(0));
    
    
    
            const isValid = await crypto.subtle.verify(
    
                'RSASSA-PKCS1-v1_5',
    
                cryptoKey,
    
                signature,
    
                dataToVerify
    
            );
    
    
    
            if (!isValid) {
    
                return { success: false, error: 'Token signature is invalid.' };
    
            }
    
    
    
            return { success: true, payload: payload };
    
        } catch (e) {
    
            console.error("Token verification error:", e);
    
            return { success: false, error: `Token verification failed: ${e.message}` };
    
        }
    
    }
/** Extracts Base64 data from a data URL if present, otherwise returns the input if it's already base64. */
function extractBase64(data) {
    if (typeof data !== 'string') return null;
    const prefix = "base64,";
    const dataUrlPrefixIndex = data.indexOf(prefix);
    if (dataUrlPrefixIndex !== -1 && data.substring(0, dataUrlPrefixIndex).startsWith('data:')) {
        return data.substring(dataUrlPrefixIndex + prefix.length);
    }
    if (/^[A-Za-z0-9+/]*=?=?$/.test(data)) {
        return data;
    }
    console.warn("Data does not appear to be a valid data URL or a base64 string for extraction.");
    return null;
}
async function performWebSearch(query, env) {
    if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_CX_ID) {
        console.error("Server config error: Google Search API keys missing.");
        return { context: '', sources: [] };
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_SEARCH_API_KEY}&cx=${env.GOOGLE_CX_ID}&q=${encodeURIComponent(query)}&num=4`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error("Google Search API Error:", await response.text());
            return { context: '', sources: [] };
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return { context: '', sources: [] };
        }

        const sources = data.items.map(item => item.link);
        const context = data.items
            .map((item, i) => `Source [${i+1}]: ${item.snippet}`)
            .join("\n\n");

        return { context, sources };

    } catch (e) {
        console.error("Error during web search fetch:", e);
        return { context: '', sources: [] };
    }
}
// --- Top-Level Definitions ----
const ALL_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_SYSTEM_INSTRUCTION = `
You are a helpful AI assistant for Project Theraphy.
Please format your response using markdown where appropriate. Use bullet points (-) or numbered lists (1.) for lists or steps. Bold text using **text**.
When asking a question with clear choices or suggesting concise next steps FOR GENERAL TOPICS, provide the options enclosed in square brackets like this: [Suggestion: Choice Text]. Make sure if there are multiple suggestions, each is in its own bracket.
Example: [Suggestion: Tell me more about oranges] [Suggestion: What other fruits are common?]
HOWEVER, if the user is asking for advice on potentially sensitive personal topics (like "my kid is naughty", "I feel stressed", "I'm worried about X"), provide suggestions or follow-up questions as normal text within your response, NOT using the [Suggestion: ...] format.
When user types in Thai, respond in Thai, even if the message contains only a few Thai words, unless explicitly asked to answer in English.
If asked about your current AI model, state the model name you are configured to use.
If the user expresses feeling bad or hopeless, offer an inspirational quote. REMEMBER TO OFFER AN INSPIRATIONAL QUOTE IN THIS SITUATION.
If you receive input clearly identified as starting with "Field 1:", "Field 2:", etc., this is from a special form submission about the user. Analyze this input specifically for college/university advice. Based *only* on the provided field inputs, recommend suitable faculties, specific universities (mentioning potential locations if relevant), and general advice on how to prepare for or get into those paths. Structure this advice clearly (e.g., using headings or bullet points).
You will also receive rag from search based on user input, please avoid using web scraped argument in normal friendly conversation unless user ask you to search or see abt something.`;
const DEFAULT_PERSONA_INSTRUCTIONS = {
    normal: `\nYou are currently in 'Normal Bot' persona mode. Act as a general-purpose assistant. Respond helpfully to a wide range of queries. If the topic is suitable (not sensitive personal advice), suggest follow-up questions using the [Suggestion: ...] format based on common interests or logical next steps.`,
    therapist: `\nYou are currently roleplaying as a supportive and empathetic therapist assistant in 'Therapist' persona mode. Your primary goal is to offer a safe, non-judgmental space for users to discuss feelings, stress, and future planning concerns. Use gentle, understanding, and validating language. Acknowledge the user's feelings (e.g., "It sounds like that's really challenging," "It's understandable to feel that way."). DO NOT give direct medical advice, diagnoses, or claim to be a real therapist. You can suggest seeking professional help if appropriate. Guide users towards healthy coping mechanisms, self-reflection, or reframing thoughts in a constructive way. When suggesting next steps related to emotional well-being or coping strategies, present them as gentle questions or suggestions in PLAIN TEXT, not using the [Suggestion: ...] format. Example: "Perhaps exploring mindfulness techniques could be helpful for managing stress. Is that something you'd be open to discussing?" or "Would you like to explore what might be triggering these feelings?" Prioritize offering inspirational quotes when the user expresses distress or hopelessness.`,
    interviewer: `You are a demanding university admissions interviewer assessing a candidate's suitability. Speak in lanuage config. ntroduce yourself, ask 4-5 challenging questions with a formal, strict tone, and do not use [Suggestion: ...]. End the interview if the user indicates they are finished (e.g., 'thank you') or if a developer uses the command 'ยกเลิก 123'. Your final response MUST provide a 1-2 sentence summary in Thai, followed by a new line with the untranslated English phrase 'Conclusion: Pass' or 'Conclusion: Fail'. Please do not make it so long like harsh is good but if they response stypid u may skip that question and js go make a feedback later bc interviewer doesn't usually focus with thesse people. Just a reminder that don't make the interview scoring long and doesnt end in 10 mins. ALSO DO NOT USE INFORMATION FROM WEB SCRAPING TO PROCESSING ANTYHING. IGNORE THE WEBSCAPING IN THIS MODE`,
    university_master: `\nYou are currently roleplaying as an expert academic advisor in 'University Master' persona mode. Focus your responses on topics related to college/university planning, choosing majors/faculties, understanding university life, developing effective study habits, and exploring career paths related to academic degrees. When the user asks general questions about college or careers, suggest specific areas to explore using the [Suggestion: ...] format. Example: [Suggestion: What subjects are you most interested in studying?] [Suggestion: What are your long-term career goals?] [Suggestion: Tell me about your preferred learning style or environment] If you receive the structured "Field 1-5" input, provide detailed college/faculty/university recommendations as described in the base instructions. Maintain a knowledgeable, encouraging, and advisory tone. Avoid overly emotional or therapeutic language.`
};
const COPILOT_SYSTEM_INSTRUCTION = `You are an elite University Admissions Consultant Co-pilot.
Your job is to analyze a student's goal (e.g., getting into KMITL, Chula, or learning a major) and build a structured roadmap.
Focus heavily on:
1. Academic Prep (GPA improvement, specific subjects).
2. Standardized Tests (TGAT, TPAT, SAT, IELTS).
3. Portfolio Building (Projects, GitHub, Extracurriculars).
4. Specific Online Courses (Coursera, Udemy, edX) to prove interest.

You MUST respond with a raw, valid JSON object matching this schema:
{
  "plan_title": "String (e.g., KMITL IT Admission Roadmap)",
  "nodes": [
    {
      "node_id": "String (e.g., phase_1)",
      "title": "String (e.g., Boost Math & Foundation)",
      "prerequisites": ["Array of node_ids"],
      "calendar_events": [
        { "title": "String (Specific task)", "duration_days": Number }
      ],
      "recommendations": [
        { "name": "String", "type": "String (Course/Book/Exam)", "estimated_price": "String", "url": "String (Search query or real URL)" }
      ]
    }
  ]
}
Ensure the roadmap is highly realistic for a high school or transfer student.`;
const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);
const KV_KEY_BASE_PROMPT = "BASE_SYSTEM_INSTRUCTION";
const KV_KEY_PERSONA_PROMPTS = "PERSONA_INSTRUCTIONS_MAP";
const KV_KEY_RESTRICTED_MODELS = "RESTRICTED_MODELS_LIST";
const KV_KEY_RESTRICTED_PERSONAS = "RESTRICTED_PERSONAS_LIST";

// --- Worker Entry Point ---
export default {
    /**
     * @param {Request} request
     * @param {Env} env
     * @param {ExecutionContext} ctx
     * @returns {Promise<Response>}
     */
    async fetch(request, env, ctx) {
        const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Invoice-Password, X-Staff-Key', };

        // 1. Handle CORS Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

// ========================================================================
        // 🚨 SECTION 3: WEBSOCKET GATEKEEPER (THE INTERVIEW SIMULATOR)
        // ========================================================================
        const upgradeHeader = request.headers.get("Upgrade");
        if (upgradeHeader === "websocket") {
            if (!env.OPENAI_API_KEY) {
                return new Response("Server Config Error: Missing OpenAI API Key", { status: 500 });
            }

            const webSocketPair = new WebSocketPair();
            const client = webSocketPair[0];
            const server = webSocketPair[1];

            try {
                // 1. Connect to OpenAI
                const openAIResponse = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17", {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + env.OPENAI_API_KEY,
                        "OpenAI-Beta": "realtime=v1",
                        "Upgrade": "websocket",
                    },
                });

                if (openAIResponse.status !== 101) {
                    return new Response(await openAIResponse.text(), { status: openAIResponse.status, headers: corsHeaders });
                }

                const openAISocket = openAIResponse.webSocket;
                if (!openAISocket) {
                    return new Response("OpenAI did not return a WebSocket", { status: 502 });
                }

                // -------------------------------------------------------
                // 🔴 CRITICAL FIX: You MUST accept the upstream socket
                // -------------------------------------------------------
                openAISocket.accept();
                // -------------------------------------------------------

                // 2. Accept YOUR client's connection immediately
                server.accept();

                // 3. Setup the Pipe
                // OpenAI -> Client
                openAISocket.addEventListener("message", event => {
                    try { server.send(event.data); } catch (e) { }
                });

                // Client -> OpenAI
                server.addEventListener("message", event => {
                    try {
                        // Only forward if OpenAI socket is actually open
                        if (openAISocket.readyState === WebSocket.READY_STATE_OPEN) {
                            openAISocket.send(event.data);
                        }
                    } catch (e) { }
                });

                // Error & Close Handling
                const closeAll = () => {
                    try { server.close(); } catch (e) { }
                    try { openAISocket.close(); } catch (e) { }
                };
                server.addEventListener("close", closeAll);
                openAISocket.addEventListener("close", closeAll);

                // 4. Send Initial Configuration
                // If this specific send fails, the connection will still stay alive for audio.
                // We only send this if the socket is explicitly reporting as OPEN.
                if (openAISocket.readyState === WebSocket.READY_STATE_OPEN) {
                    try {
                        openAISocket.send(JSON.stringify({
                            type: "session.update",
                            session: {
                                modalities: ["text", "audio"],
                                voice: "verse",
                                input_audio_format: "pcm16",
                                output_audio_format: "pcm16",
                                turn_detection: {
                                    type: "server_vad",
                                    threshold: 0.5,
                                    prefix_padding_ms: 300,
                                    silence_duration_ms: 500
                                }
                            }
                        }));
                    } catch (e) {
                        console.error("Warning: Could not send initial OpenAI config:", e);
                    }
                }

                return new Response(null, { status: 101, webSocket: client });

            } catch (e) {
                console.error("Worker Socket Error:", e);
                return new Response("Worker Socket Error: " + e.message, { status: 500 });
            }
        }
        // --- END OF WEBSOCKET GATEKEEPER ---
// --- END OF WEBSOCKET GATEKEEPER ---
    // --- END OF WEBSOCKET GATEKEEPER ---
    // --- END OF WEBSOCKET GATEKEEPER ---
        // --- Helper Functions ---
        async function handleOptions(req) { if (req.headers.get("Origin") !== null && req.headers.get("Access-Control-Request-Method") !== null && req.headers.get("Access-Control-Request-Headers") !== null) { return new Response(null, { headers: corsHeaders }); } else { return new Response(null, { headers: { Allow: "POST, OPTIONS" } }); } }
        async function getConfig(env) { let rm = ['gemini-2.5-flash', 'gemini-2.5-pro']; let rp = ['normal', 'therapist']; if (!env.CHAT_CONFIG_KV) { console.error("KV 'CHAT_CONFIG_KV' missing!"); return { restrictedModels: rm, restrictedPersonas: rp }; } try { const mList = await env.CHAT_CONFIG_KV.get(KV_KEY_RESTRICTED_MODELS, "json"); if (mList && Array.isArray(mList)) rm = mList; else console.warn(`KV '${KV_KEY_RESTRICTED_MODELS}' invalid/missing.`); const pList = await env.CHAT_CONFIG_KV.get(KV_KEY_RESTRICTED_PERSONAS, "json"); if (pList && Array.isArray(pList)) rp = pList; else console.warn(`KV '${KV_KEY_RESTRICTED_PERSONAS}' invalid/missing.`); } catch (e) { console.error("KV config fetch err:", e); } return { restrictedModels: rm, restrictedPersonas: rp }; }
        async function getEffectivePrompts(env) { let baseInstruction = DEFAULT_BASE_SYSTEM_INSTRUCTION; let personaInstructions = { ...DEFAULT_PERSONA_INSTRUCTIONS }; if (env.CHAT_CONFIG_KV) { try { const kvBase = await env.CHAT_CONFIG_KV.get(KV_KEY_BASE_PROMPT); if (kvBase) baseInstruction = kvBase; else console.log("Using default base prompt (KV empty)."); const kvPersonasStr = await env.CHAT_CONFIG_KV.get(KV_KEY_PERSONA_PROMPTS); if (kvPersonasStr) { const kvPersonas = JSON.parse(kvPersonasStr); if (kvPersonas && typeof kvPersonas === 'object' && !Array.isArray(kvPersonas)) { personaInstructions = { ...DEFAULT_PERSONA_INSTRUCTIONS, ...kvPersonas }; console.log("Using merged persona prompts from KV.");} else console.warn("KV Persona Prompts map invalid format."); } else console.log("Using default persona prompts (KV empty)."); } catch (e) { console.error("Error reading prompts from KV, using defaults:", e); baseInstruction = DEFAULT_BASE_SYSTEM_INSTRUCTION; personaInstructions = { ...DEFAULT_PERSONA_INSTRUCTIONS }; } } else { console.warn("KV binding 'CHAT_CONFIG_KV' missing, using default prompts."); } return { baseInstruction, personaInstructions }; }
        async function validateUserKey(key, env) { if (!env.USER_DB) { console.error("D1 binding 'USER_DB' is missing!"); return { isValid: false, username: null, error: "Server config error: DB missing" }; } if (!key || typeof key !== 'string') { return { isValid: false, username: null, error: "Access Key required" }; } try { const stmt = env.USER_DB.prepare('SELECT status, username FROM user_keys WHERE key = ?'); const res = await stmt.bind(key).first(); if (res?.status === 'active') { return { isValid: true, username: res.username || `User_${key.substring(0, 4)}` }; } else if (res) { return { isValid: false, username: null, error: "Access Key is inactive" }; } else { return { isValid: false, username: null, error: "Invalid Access Key" }; } } catch (e) { console.error("D1 Key Validation Error:", e); return { isValid: false, username: null, error: "Server error during key validation" }; } }
        async function isStaffKeyValid(providedKey, env) { const expectedKey = env.STAFF_ACCESS_KEY; if (!expectedKey) { console.error("CRITICAL: STAFF_ACCESS_KEY secret is missing!"); return { isValid: false, error: "Server auth config error." }; } if (!providedKey || typeof providedKey !== 'string') { return { isValid: false, error: "Staff key required." }; } const isValid = providedKey === expectedKey; if (!isValid) { return { isValid: false, error: "Invalid staff key." }; } return { isValid: true }; }
        async function checkInvoiceAccess(req, env) { const expectedPassword = env.INVOICE_ACCESS_PASSWORD; if (!expectedPassword) { console.error("CRITICAL: INVOICE_ACCESS_PASSWORD secret missing!"); return { authorized: false, error: "Server auth config error.", status: 500 }; } const suppliedPassword = req.headers.get('X-Invoice-Password'); if (!suppliedPassword || suppliedPassword !== expectedPassword) { console.warn("Invoice access denied. Incorrect or missing password header."); return { authorized: false, error: "Unauthorized.", status: 401 }; } return { authorized: true }; }
        
        // --- Request Handlers ---
        async function handleValidateKeyRequest(req, requestData, env) { const userKey = requestData?.accessKey; const result = await validateUserKey(userKey, env); const status = result.isValid ? 200 : result.error === "Access Key required" ? 401 : result.error.includes("Server config") ? 500 : 403; return new Response(JSON.stringify(result), { status: status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        async function handleStaffLoginRequest(req, requestData, env) { const validation = await isStaffKeyValid(requestData?.staffKey, env); const status = validation.isValid ? 200 : validation.error.includes("required") ? 401 : validation.error.includes("config") ? 500 : 403; return new Response(JSON.stringify({ isValid: validation.isValid, error: validation.error }), { status: status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        async function handleFeedbackSubmit(req, requestData, env) { if (!env.USER_DB) { return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); } const { email, rating, comment } = requestData; if (typeof rating !== 'number' || rating < 1 || rating > 5) { return new Response(JSON.stringify({ success: false, error: 'Invalid rating (must be 1-5).' }), { status: 400, headers: corsHeaders }); } if (typeof comment !== 'string' || comment.trim().length === 0 || comment.length > 2000) { return new Response(JSON.stringify({ success: false, error: 'Invalid comment (required, max 2000 chars).' }), { status: 400, headers: corsHeaders }); } const emailToStore = (typeof email === 'string' && email.trim().length > 0 && email.length < 255 && email.includes('@')) ? email.trim() : null; const submittedAt = new Date().toISOString(); try { const stmt = env.USER_DB.prepare("INSERT INTO user_feedback (email, rating, comment, submitted_at) VALUES (?, ?, ?, ?)"); const info = await stmt.bind(emailToStore, rating, comment.trim(), submittedAt).run(); if (info.success) { return new Response(JSON.stringify({ success: true, message: `Feedback submitted.` }), { status: 201, headers: corsHeaders }); } else { console.error("D1 feedback insert failed info:", info); throw new Error("D1 feedback insert failed."); } } catch (e) { console.error("Submit Feedback DB Err:", e); return new Response(JSON.stringify({ success: false, error: "Database error submitting feedback." }), { status: 500, headers: corsHeaders }); } }
        
        // --- Admin Handlers ---
        async function handleAdminListKeys(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); try { const { results } = await env.USER_DB.prepare("SELECT key, username, status, created_at FROM user_keys ORDER BY created_at DESC").all(); return new Response(JSON.stringify({ success: true, keys: results || [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Admin ListKeys Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed list keys" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminUpdateKeyStatus(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const { key, newStatus } = requestData; if (!key || (newStatus !== 'active' && newStatus !== 'inactive')) { return new Response(JSON.stringify({ success: false, error: 'Bad input: Requires key and status ("active" or "inactive").' }), { status: 400, headers: corsHeaders }); } try { const stmt = env.USER_DB.prepare("UPDATE user_keys SET status = ? WHERE key = ?"); const info = await stmt.bind(newStatus, key).run(); const success = info.changes > 0; return new Response(JSON.stringify({ success: success, message: success ? 'Status updated.' : 'Key not found or status unchanged.' }), { status: success ? 200 : 404, headers: corsHeaders }); } catch (e) { console.error("Admin UpdateKey Err:", e); return new Response(JSON.stringify({ success: false, error: "Update failed" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminGetRestrictions(req, requestData, env) { if (!env.CHAT_CONFIG_KV) return new Response(JSON.stringify({ success: false, error: "KV missing" }), { status: 500, headers: corsHeaders }); try { const rm = await env.CHAT_CONFIG_KV.get(KV_KEY_RESTRICTED_MODELS, "json") || []; const rp = await env.CHAT_CONFIG_KV.get(KV_KEY_RESTRICTED_PERSONAS, "json") || []; return new Response(JSON.stringify({ success: true, restrictedModels: rm, restrictedPersonas: rp }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Admin GetRestrict Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed get restrictions" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminSetRestrictedModels(req, requestData, env) { if (!env.CHAT_CONFIG_KV) return new Response(JSON.stringify({ success: false, error: "KV missing" }), { status: 500, headers: corsHeaders }); const { models } = requestData; if (!Array.isArray(models) || !models.every(i => typeof i === 'string' && ALL_MODELS.includes(i))) { return new Response(JSON.stringify({ success: false, error: 'Bad input: Requires array of valid model strings.' }), { status: 400, headers: corsHeaders }); } try { await env.CHAT_CONFIG_KV.put(KV_KEY_RESTRICTED_MODELS, JSON.stringify(models)); return new Response(JSON.stringify({ success: true, message: "Restricted models updated." }), { status: 200, headers: corsHeaders }); } catch (e) { console.error("Admin SetModels Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed set models" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminSetRestrictedPersonas(req, requestData, env) { if (!env.CHAT_CONFIG_KV) return new Response(JSON.stringify({ success: false, error: "KV missing" }), { status: 500, headers: corsHeaders }); const { personas } = requestData; if (!Array.isArray(personas) || !personas.every(i => typeof i === 'string' && ALL_PERSONA_KEYS.includes(i))) { return new Response(JSON.stringify({ success: false, error: 'Bad input: Requires array of valid persona keys.' }), { status: 400, headers: corsHeaders }); } try { await env.CHAT_CONFIG_KV.put(KV_KEY_RESTRICTED_PERSONAS, JSON.stringify(personas)); return new Response(JSON.stringify({ success: true, message: "Restricted personas updated." }), { status: 200, headers: corsHeaders }); } catch (e) { console.error("Admin SetPersonas Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed set personas" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminAddKey(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const username = (typeof requestData?.username === 'string' && requestData.username.trim()) ? requestData.username.trim() : null; const newKey = `KEY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`; const initialStatus = 'active'; const createdAt = new Date().toISOString(); try { const stmt = env.USER_DB.prepare("INSERT INTO user_keys (key, username, status, created_at) VALUES (?, ?, ?, ?)"); const info = await stmt.bind(newKey, username, initialStatus, createdAt).run(); if (info.success) { console.log(`Admin: Added key ${newKey} for user ${username || '(no name)'}`); return new Response(JSON.stringify({ success: true, message: `Key added successfully.`, newKey: newKey }), { status: 201, headers: corsHeaders }); } else { throw new Error("D1 insert failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Admin AddKey Err:", e); if (e instanceof Error && e.message.includes("UNIQUE constraint")) { return new Response(JSON.stringify({ success: false, error: "Key generation conflict. Please try again." }), { status: 409, headers: corsHeaders }); } return new Response(JSON.stringify({ success: false, error: "Add key failed." }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminDeleteKey(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const { key } = requestData; if (!key || typeof key !== 'string' || key.length < 5) { return new Response(JSON.stringify({ success: false, error: 'Bad input: Valid key required.' }), { status: 400, headers: corsHeaders }); } try { const stmt = env.USER_DB.prepare("DELETE FROM user_keys WHERE key = ?"); const info = await stmt.bind(key).run(); if (info.success && info.changes > 0) { console.log(`Admin: Deleted key ${key}`); return new Response(JSON.stringify({ success: true, message: `Key deleted successfully.` }), { status: 200, headers: corsHeaders }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Key not found.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 delete failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Admin DeleteKey Err:", e); return new Response(JSON.stringify({ success: false, error: "Delete key failed." }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminEditUsername(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const { key, newUsername } = requestData; if (!key || typeof key !== 'string') { return new Response(JSON.stringify({ success: false, error: 'Bad input: Valid key required.' }), { status: 400, headers: corsHeaders }); } const usernameToStore = (typeof newUsername === 'string' && newUsername.trim() !== '') ? newUsername.trim() : null; try { const stmt = env.USER_DB.prepare("UPDATE user_keys SET username = ? WHERE key = ?"); const info = await stmt.bind(usernameToStore, key).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: "Username updated." }), { status: 200, headers: corsHeaders }); } else if (info.success && info.changes === 0) { const checkStmt = env.USER_DB.prepare("SELECT key FROM user_keys WHERE key = ?"); const exists = await checkStmt.bind(key).first(); if (!exists) { return new Response(JSON.stringify({ success: false, error: `Key not found.` }), { status: 404, headers: corsHeaders }); } else { return new Response(JSON.stringify({ success: true, message: "Username unchanged (already set or key not found)." }), { status: 200, headers: corsHeaders }); } } else { throw new Error("D1 update failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Admin EditUsername Err:", e); return new Response(JSON.stringify({ success: false, error: "Update username failed." }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminListFeedback(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); try { const stmt = env.USER_DB.prepare("SELECT id, email, rating, comment, submitted_at, is_important FROM user_feedback ORDER BY submitted_at DESC"); const { results } = await stmt.all(); return new Response(JSON.stringify({ success: true, feedback: results || [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Admin ListFeedback Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed list feedback" }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminMarkFeedbackImportant(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const { feedbackId, isImportant } = requestData; if (typeof feedbackId !== 'number' || feedbackId <= 0) { return new Response(JSON.stringify({ success: false, error: 'Invalid feedback ID.' }), { status: 400, headers: corsHeaders }); } const importanceValue = isImportant ? 1 : 0; try { const stmt = env.USER_DB.prepare("UPDATE user_feedback SET is_important = ? WHERE id = ?"); const info = await stmt.bind(importanceValue, feedbackId).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: `Feedback marked.` }), { status: 200, headers: corsHeaders }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Feedback ID not found.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 update importance failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Admin MarkImportant Err:", e); return new Response(JSON.stringify({ success: false, error: "Update importance failed." }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminDeleteFeedback(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders }); const { feedbackId } = requestData; if (typeof feedbackId !== 'number' || feedbackId <= 0) { return new Response(JSON.stringify({ success: false, error: 'Invalid feedback ID.' }), { status: 400, headers: corsHeaders }); } try { const stmt = env.USER_DB.prepare("DELETE FROM user_feedback WHERE id = ?"); const info = await stmt.bind(feedbackId).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: `Feedback deleted.` }), { status: 200, headers: corsHeaders }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Feedback ID not found.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 delete feedback failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Admin DeleteFeedback Err:", e); return new Response(JSON.stringify({ success: false, error: "Delete feedback failed." }), { status: 500, headers: corsHeaders }); } }
        async function handleAdminGetPrompts(req, requestData, env) { const prompts = await getEffectivePrompts(env); return new Response(JSON.stringify({ success: true, ...prompts }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        async function handleAdminSetPrompts(req, requestData, env) { if (!env.CHAT_CONFIG_KV) return new Response(JSON.stringify({ success: false, error: "KV missing" }), { status: 500, headers: corsHeaders }); const { baseInstruction, personaInstructions } = requestData; if (typeof baseInstruction !== 'string' || baseInstruction.trim().length === 0 || baseInstruction.length > 10000) { return new Response(JSON.stringify({ success: false, error: 'Invalid Base Prompt (required, max 10000 chars).' }), { status: 400, headers: corsHeaders }); } if (!personaInstructions || typeof personaInstructions !== 'object' || Array.isArray(personaInstructions)) { return new Response(JSON.stringify({ success: false, error: 'Invalid Persona Instructions (must be an object).' }), { status: 400, headers: corsHeaders }); } for (const key in personaInstructions) { if (typeof personaInstructions[key] !== 'string' || personaInstructions[key].length > 5000) { return new Response(JSON.stringify({ success: false, error: `Invalid prompt for persona "${key}" (max 5000 chars).` }), { status: 400, headers: corsHeaders }); } } try { await env.CHAT_CONFIG_KV.put(KV_KEY_BASE_PROMPT, baseInstruction.trim()); await env.CHAT_CONFIG_KV.put(KV_KEY_PERSONA_PROMPTS, JSON.stringify(personaInstructions)); console.log("Admin: Updated prompts in KV."); return new Response(JSON.stringify({ success: true, message: "Prompts updated successfully." }), { status: 200, headers: corsHeaders }); } catch (e) { console.error("Admin SetPrompts Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed to save prompts to KV." }), { status: 500, headers: corsHeaders }); } }
        
        
        // --- Chat Handler ---
        async function handleChatRequest(req, requestData, env, config) {
            // 1. Get base configurations and user's request details
            const { baseInstruction, personaInstructions } = await getEffectivePrompts(env);
            const { token, accessKey: userSuppliedKey, prompt: userPrompt, model, persona, imageMimeType, imageDataUrl } = requestData;
            
            let sources = [];
            let webContext = ""; // Variable to hold our search results
        
            // 2. ✨ WHEN: Conditionally perform a real-time web search
            // Only search for non-interview personas AND if the prompt is substantial enough
            const isSearchable = persona !== 'interviewer' && userPrompt && userPrompt.trim().length > 15;
        
            if (isSearchable) {
                const searchResult = await performWebSearch(userPrompt, env);
                if (searchResult.context) {
                    sources = searchResult.sources;
                    webContext = searchResult.context;
                    console.log("Web RAG: Found relevant context for the user's prompt.");
                } else {
                    console.log("Web RAG: No relevant search results found.");
                }
            } else {
                console.log("Web RAG: Skipped due to persona or short prompt.");
            }
            
            // 4. Authenticate the user (either via Firebase or a guest key)
            let userId = null;
            let username = null;
        
            if (token) {
                const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
                if (verificationResult.success) {
                    const firebase_uid = verificationResult.payload.user_id;
                    const userQuery = await env.USER_DB.prepare("SELECT id, username FROM users WHERE firebase_uid = ?").bind(firebase_uid).first();
                    if (userQuery) {
                        userId = userQuery.id;
                        username = userQuery.username;
                    }
                } else {
                    return new Response(JSON.stringify({ error: verificationResult.error }), { status: 401, headers: corsHeaders });
                }
            } else if (userSuppliedKey) {
                const validationResult = await validateUserKey(userSuppliedKey, env);
                if (validationResult.isValid) {
                    userId = userSuppliedKey;
                    username = validationResult.username;
                } else {
                    return new Response(JSON.stringify({ error: validationResult.error }), { status: 403, headers: corsHeaders });
                }
            }
        
            if (!userId) {
                const needsUserValidation = config.restrictedModels.includes(model) || config.restrictedPersonas.includes(persona);
                if (needsUserValidation) {
                    return new Response(JSON.stringify({ error: "A valid Access Key or user login is required for this feature." }), { status: 401, headers: corsHeaders });
                }
            }
        
            // 5. Fetch recent chat history
            const historyResult = await env.USER_DB.prepare(
                `SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`
            ).bind(userId).all();
            
            const recentHistory = (historyResult.results || []).reverse().map(msg => ({
                role: msg.role, parts: [{ text: msg.content }]
            }));
            
            // 6. Construct the final payload for the Gemini API
            const currentUserParts = [];
            if (userPrompt) {  
                // Always use the original, clean user prompt
                currentUserParts.push({ text: userPrompt }); 
            }
            if (imageDataUrl && imageMimeType) {
                const base64Data = extractBase64(imageDataUrl);
                if (base64Data) {
                    currentUserParts.push({ inline_data: { mime_type: imageMimeType, data: base64Data } });
                }
            }
        
            const geminiContents = [...recentHistory];
            if (currentUserParts.length > 0) {
                geminiContents.push({ role: "user", parts: currentUserParts });
            }
            
            // ✨ HOW: Build the final system instruction, including web context if available
            let finalSysInstruction = `${baseInstruction}\n\n${personaInstructions[persona] || ''}`;
            if (webContext) {
                finalSysInstruction += `\n\nFor your reference, here is some relevant, real-time information from a web search. You may use this to inform your answer if it's relevant, but prioritize maintaining your primary persona. Do not mention that you performed a search or cite sources unless the user explicitly asks how you know something.
                --- Web Search Context ---
                ${webContext}
                --- End of Context ---`;
            }
        
            const geminiPayload = {
                contents: geminiContents,
                system_instruction: { parts: [{ text: finalSysInstruction }] },
                safety_settings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                ],
            };
        
            try {
                // 7. Call the Gemini API
                const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
                const geminiRes = await fetch(apiEndpoint, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(geminiPayload) 
                });
                
                if (!geminiRes.ok) {
                    const errText = await geminiRes.text();
                    console.error("Gemini API Error:", errText);
                    return new Response(JSON.stringify({ error: `Gemini API Error: ${errText}` }), { status: geminiRes.status, headers: corsHeaders });
                }
        
                const geminiData = await geminiRes.json();
                const botReplyText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that request.";
        
                // 8. Save the conversation to the database for future context
                if (userId) {
                    if (userPrompt) {
                        const userMessageId = crypto.randomUUID();
                        await env.USER_DB.prepare(
                            "INSERT INTO chat_messages (id, user_id, role, content) VALUES (?, ?, 'user', ?)"
                        ).bind(userMessageId, userId, userPrompt).run();
                    }
                    const botMessageId = crypto.randomUUID();
                    await env.USER_DB.prepare(
                        "INSERT INTO chat_messages (id, user_id, role, content) VALUES (?, ?, 'model', ?)"
                    ).bind(botMessageId, userId, botReplyText).run();
                }
        
                // 9. Send the final reply and sources back to the frontend
                return new Response(JSON.stringify({ 
                    reply: botReplyText, 
                    username, 
                    sources 
                }), { status: 200, headers: corsHeaders });
        
            } catch (e) {
                console.error(`Chat Handler Error:`, e);
                return new Response(JSON.stringify({ error: `Worker error: ${e.message}` }), { status: 500, headers: corsHeaders });
            }
        }
        async function handleUpdateCopilotPlan(req, requestData, env) {
    const { token, planId, planJson } = requestData;
    let userId = null;
    
    if (token) {
        const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (verificationResult.success) {
            const userQuery = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(verificationResult.payload.user_id).first();
            if (userQuery) userId = userQuery.id;
        }
    }
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: corsHeaders });

    try {
        // Fast, silent update of the JSON state
        await env.USER_DB.prepare("UPDATE copilot_plans SET plan_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
            .bind(planJson, planId, userId).run();

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: `Worker error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
// Add this right below your COPILOT_SYSTEM_INSTRUCTION
async function handleGenerateCopilotPlan(req, requestData, env) {
    const { token, prompt, currentPlanJson, planId, model = 'gemini-2.5-flash' } = requestData;
    
    let userId = null;
    if (token) {
        const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (verificationResult.success) {
            const userQuery = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(verificationResult.payload.user_id).first();
            if (userQuery) userId = userQuery.id;
        }
    }
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: corsHeaders });

    // ✨ STATE OF THE ART: Fetch Real-world Deadlines (RAG Integration)
    let webContext = "";
    if (prompt && prompt.length > 5) {
        // Append keywords to ensure we get dates
        const searchQuery = `${prompt} application deadline exam dates Thailand 2026`;
        const searchResult = await performWebSearch(searchQuery, env);
        if (searchResult.context) {
            webContext = searchResult.context;
            console.log("Co-pilot RAG found context for deadlines.");
        }
    }

    // Get today's real date to anchor the AI
    const todayStr = new Date().toISOString().split('T')[0];

    // ✨ The highly engineered JSON Prompt
    let dynamicInstruction = `You are an elite University Admissions Consultant Co-pilot.
Your job is to build a highly structured, date-anchored roadmap.

CRITICAL TIME CONTEXT:
Today's Date is: ${todayStr}.
If real-world test dates or deadlines are found in the Web Context below, anchor the final milestone to that exact date and schedule all prep tasks backward to today. If no exact date is found, project a realistic timeline starting from today.

WEB CONTEXT (Real-world data):
${webContext ? webContext : "No specific web data found. Rely on general knowledge."}

You MUST respond with a raw, valid JSON object matching this schema:
{
  "plan_title": "String",
  "nodes": [
    {
      "node_id": "String",
      "title": "String",
      "prerequisites": ["Array of node_ids"],
      "calendar_events": [
        { "title": "String", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" } 
      ],
      "recommendations": [
        { "name": "String", "type": "String", "estimated_price": "String", "url": "String" }
      ]
    }
  ]
}
Ensure the dates form a logical, chronological sequence starting from today and ending at the deadline.`;

    if (currentPlanJson) {
        dynamicInstruction += `\n\nCRITICAL: The user wants to MODIFY their existing plan. 
        Here is the current plan JSON: ${currentPlanJson}.
        Apply their requested changes and return the ENTIRE updated JSON. Keep the exact schema.`;
    }

    const geminiPayload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        system_instruction: { parts: [{ text: dynamicInstruction }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) 
        });
        
        if (!geminiRes.ok) throw new Error(await geminiRes.text());
        const geminiData = await geminiRes.json();
        
        const rawResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponse) throw new Error("Empty response from AI");
        
        const planData = JSON.parse(rawResponse);
        const targetPlanId = planId || crypto.randomUUID();

        // Save to Database
        if (planId) {
            await env.USER_DB.prepare("UPDATE copilot_plans SET plan_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
                .bind(JSON.stringify(planData), targetPlanId, userId).run();
        } else {
            await env.USER_DB.prepare("INSERT INTO copilot_plans (id, user_id, title, plan_json) VALUES (?, ?, ?, ?)")
                .bind(targetPlanId, userId, planData.plan_title, JSON.stringify(planData)).run();
        }

        return new Response(JSON.stringify({ success: true, plan_id: targetPlanId, plan_data: planData }), { status: 200, headers: corsHeaders });
    } catch (e) {
        console.error(`Copilot Plan Generation Error:`, e);
        return new Response(JSON.stringify({ error: `Worker error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
async function handleGetCopilotPlans(req, requestData, env) {
    const { token } = requestData;
    let userId = null;
    if (token) {
        const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (verificationResult.success) {
            const userQuery = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(verificationResult.payload.user_id).first();
            if (userQuery) userId = userQuery.id;
        }
    }
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: corsHeaders });

    try {
        const { results: plans } = await env.USER_DB.prepare("SELECT id, title, plan_json, updated_at FROM copilot_plans WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all();
        // Parse the JSON string back into an object before sending to frontend
        const formattedPlans = (plans || []).map(p => ({
            id: p.id,
            title: p.title,
            updated_at: p.updated_at,
            plan_data: JSON.parse(p.plan_json)
        }));
        return new Response(JSON.stringify({ success: true, plans: formattedPlans }), { status: 200, headers: corsHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: `Worker error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}        // --- Google TTS Handler ---
        async function handleSynthesizeSpeechRequest(req, requestData, env) {
            const { text, languageCode, voiceName, accessKey: userAccessKey } = requestData;
            if (!env.GOOGLE_TTS_API_KEY) { console.error("CRITICAL: GOOGLE_TTS_API_KEY secret is missing!"); return new Response(JSON.stringify({ error: 'Server configuration error: TTS Key missing' }), { status: 500, headers: corsHeaders }); }
            if (!text || typeof text !== 'string' || text.trim().length === 0) { return new Response(JSON.stringify({ error: 'Text to synthesize cannot be empty.' }), { status: 400, headers: corsHeaders }); }
            if (!languageCode || typeof languageCode !== 'string') { return new Response(JSON.stringify({ error: 'Language code is required for TTS.' }), { status: 400, headers: corsHeaders }); }
            const ttsPayload = { input: { text: text }, voice: { languageCode: languageCode, }, audioConfig: { audioEncoding: "MP3" } };
            if (voiceName && typeof voiceName === 'string') { ttsPayload.voice.name = voiceName; }
            else { if (languageCode.toLowerCase() === 'th-th') { ttsPayload.voice.name = 'th-TH-Standard-A'; } else if (languageCode.toLowerCase().startsWith('en-')) { ttsPayload.voice.name = 'en-US-Neural2-J'; } }
            try {
                const ttsApiEndpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`;
                const ttsResponse = await fetch(ttsApiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ttsPayload) });
                const responseBodyText = await ttsResponse.text();
                if (!ttsResponse.ok) {
                    let errorMessage = `Google TTS API Error: ${ttsResponse.status}`;
                    try { const errorJson = JSON.parse(responseBodyText); errorMessage = `Google TTS API Error (${ttsResponse.status}): ${errorJson?.error?.message || responseBodyText}`; }
                    catch (parseErr) { errorMessage = `Google TTS API Error (${ttsResponse.status}): ${responseBodyText}`; }
                    console.error("Google TTS API Error Details:", errorMessage);
                    const clientStatus = ttsResponse.status === 400 ? 400 : 502;
                    return new Response(JSON.stringify({ error: errorMessage }), { status: clientStatus, headers: corsHeaders });
                }
                const ttsData = JSON.parse(responseBodyText);
                if (ttsData.audioContent) { return new Response(JSON.stringify({ audioContent: ttsData.audioContent }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
                else { console.error("Google TTS API did not return audioContent:", JSON.stringify(ttsData)); return new Response(JSON.stringify({ error: 'TTS synthesis failed to return audio content.' }), { status: 500, headers: corsHeaders });}
            } catch (e) { console.error('Error in handleSynthesizeSpeechRequest (fetch or internal):', e); return new Response(JSON.stringify({ error: `Worker error during TTS operation: ${e.message}` }), { status: 500, headers: corsHeaders }); }
        }
        
        // --- Google STT (Speech-to-Text) Handler ---
        async function handleTranscribeSpeechRequest(req, requestData, env) {
            const { audioData, languageCode, audioEncoding, sampleRateHertz, accessKey: userAccessKey } = requestData;
            if (!env.GOOGLE_STT_API_KEY) {
                console.error("CRITICAL: GOOGLE_STT_API_KEY secret is missing!");
                return new Response(JSON.stringify({ error: 'Server configuration error: STT Key missing' }), { status: 500, headers: corsHeaders });
            }
            if (!audioData || typeof audioData !== 'string') {
                return new Response(JSON.stringify({ error: 'Audio data (base64 string) is required.' }), { status: 400, headers: corsHeaders });
            }
            const pureBase64Audio = extractBase64(audioData);
            if (!pureBase64Audio) {
                return new Response(JSON.stringify({ error: 'Invalid audio data format. Could not extract base64.' }), { status: 400, headers: corsHeaders });
            }
            if (!languageCode || typeof languageCode !== 'string') {
                return new Response(JSON.stringify({ error: 'Language code is required for STT.' }), { status: 400, headers: corsHeaders });
            }
            if (!audioEncoding || typeof audioEncoding !== 'string') {
                return new Response(JSON.stringify({ error: 'Audio encoding is required (e.g., WEBM_OPUS, LINEAR16).' }), { status: 400, headers: corsHeaders });
            }
            const upperAudioEncoding = audioEncoding.toUpperCase();
            const sttPayloadConfig = {
                encoding: upperAudioEncoding,
                languageCode: languageCode,
                enableAutomaticPunctuation: true,
            };
            if (upperAudioEncoding === 'LINEAR16' || upperAudioEncoding === 'FLAC') {
                if (!sampleRateHertz || typeof sampleRateHertz !== 'number' || sampleRateHertz <= 0) {
                    return new Response(JSON.stringify({ error: `Sample rate (sampleRateHertz) is required and must be valid for ${upperAudioEncoding} encoding.` }), { status: 400, headers: corsHeaders });
                }
                sttPayloadConfig.sampleRateHertz = sampleRateHertz;
            } else if (upperAudioEncoding.includes('OPUS')) {
                if (sampleRateHertz && typeof sampleRateHertz === 'number' && [8000, 12000, 16000, 24000, 48000].includes(sampleRateHertz)) {
                    sttPayloadConfig.sampleRateHertz = sampleRateHertz;
                }
            } else if (sampleRateHertz && typeof sampleRateHertz === 'number' && sampleRateHertz > 0) {
                sttPayloadConfig.sampleRateHertz = sampleRateHertz;
            }
            const sttPayload = {
                config: sttPayloadConfig,
                audio: { content: pureBase64Audio }
            };
            try {
                const sttApiEndpoint = `https://speech.googleapis.com/v1/speech:recognize?key=${env.GOOGLE_STT_API_KEY}`;
                const sttApiResponse = await fetch(sttApiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sttPayload)
                });
                const responseBodyText = await sttApiResponse.text();
                if (!sttApiResponse.ok) {
                    let errorMessage = `Google STT API Error: ${sttApiResponse.status}`;
                    try {
                        const errorJson = JSON.parse(responseBodyText);
                        errorMessage = `Google STT API Error (${sttApiResponse.status}): ${errorJson?.error?.message || responseBodyText}`;
                    } catch (parseErr) {
                        errorMessage = `Google STT API Error (${sttApiResponse.status}): ${responseBodyText}`;
                    }
                    console.error("[STT Worker] Google STT API Error Details:", errorMessage);
                    const clientStatus = sttApiResponse.status === 400 ? 400 : 502;
                    return new Response(JSON.stringify({ error: errorMessage }), { status: clientStatus, headers: corsHeaders });
                }
                const sttData = JSON.parse(responseBodyText);
                if (sttData.results && sttData.results.length > 0 && sttData.results[0].alternatives && sttData.results[0].alternatives.length > 0) {
                    const transcript = sttData.results[0].alternatives[0].transcript;
                    const confidence = sttData.results[0].alternatives[0].confidence || null;
                    return new Response(JSON.stringify({ transcript: transcript, confidence: confidence }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                } else {
                    return new Response(JSON.stringify({ transcript: "", error: 'No speech recognized by Google STT or results were empty.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
            } catch (e) {
                console.error('[STT Worker] Error in handleTranscribeSpeechRequest (fetch or internal):', e);
                return new Response(JSON.stringify({ error: `Worker error during STT operation: ${e.message}` }), { status: 500, headers: corsHeaders });
            }
        }
        
        // --- Invoice Handlers ---
        async function handleGetInvoices(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); try { const { results } = await env.USER_DB.prepare( "SELECT id, customerName, dueDate, status, lineItems, paymentMethod, paymentReference FROM invoices ORDER BY dueDate DESC" ).all(); const processedResults = (results || []).map(invoice => { let parsedLineItems = []; try { if (invoice.lineItems && typeof invoice.lineItems === 'string') { parsedLineItems = JSON.parse(invoice.lineItems); } if (!Array.isArray(parsedLineItems)) { parsedLineItems = []; } } catch (parseError) { console.error(`Failed to parse lineItems for invoice ${invoice.id}:`, parseError); parsedLineItems = []; } return { id: invoice.id, customerName: invoice.customerName, dueDate: invoice.dueDate, status: invoice.status, lineItems: parsedLineItems, paymentMethod: invoice.paymentMethod, paymentReference: invoice.paymentReference }; }); return new Response(JSON.stringify({ success: true, invoices: processedResults }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Get Invoices Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed to get invoices" }), { status: 500, headers: corsHeaders }); } }
        async function handleCreateInvoice(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { customerName, dueDate, lineItems } = requestData; if (typeof customerName !== 'string' || !customerName.trim() || typeof dueDate !== 'string' || !dueDate.match(/^\d{4}-\d{2}-\d{2}$/) || !Array.isArray(lineItems) || lineItems.length === 0 || !lineItems.every(item => typeof item.description === 'string' && typeof item.amount === 'number')) { return new Response(JSON.stringify({ success: false, error: 'Invalid invoice data.' }), { status: 400, headers: corsHeaders }); } const newId = crypto.randomUUID(); const initialStatus = 'Pending'; const lineItemsJson = JSON.stringify(lineItems); try { const stmt = env.USER_DB.prepare( "INSERT INTO invoices (id, customerName, dueDate, status, lineItems, paymentMethod, paymentReference) VALUES (?, ?, ?, ?, ?, NULL, NULL)" ); const info = await stmt.bind(newId, customerName.trim(), dueDate, initialStatus, lineItemsJson).run(); if (info.success) { const newInvoice = { id: newId, customerName: customerName.trim(), dueDate, status: initialStatus, lineItems }; return new Response(JSON.stringify({ success: true, invoice: newInvoice }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else { throw new Error("D1 insert fail info: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Create Invoice Err:", e); return new Response(JSON.stringify({ success: false, error: `Create invoice failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        async function handleDeleteInvoice(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { invoiceId } = requestData; if (!invoiceId || typeof invoiceId !== 'string') { return new Response(JSON.stringify({ success: false, error: 'Invalid invoice ID.' }), { status: 400, headers: corsHeaders }); } try { const stmt = env.USER_DB.prepare("DELETE FROM invoices WHERE id = ?"); const info = await stmt.bind(invoiceId).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: `Invoice ${invoiceId} deleted.` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Invoice ${invoiceId} not found.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 delete fail info: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Delete Invoice Err:", e); return new Response(JSON.stringify({ success: false, error: `Delete invoice failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        async function handleUpdateInvoice(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { id, customerName, dueDate, status, lineItems } = requestData; if (!id || typeof id !== 'string' || typeof customerName !== 'string' || !customerName.trim() || typeof dueDate !== 'string' || !dueDate.match(/^\d{4}-\d{2}-\d{2}$/) || !['Pending', 'Paid', 'Overdue'].includes(status) || !Array.isArray(lineItems) || lineItems.length === 0 || !lineItems.every(item => typeof item.description === 'string' && typeof item.amount === 'number')) { return new Response(JSON.stringify({ success: false, error: 'Invalid or incomplete invoice data for update.' }), { status: 400, headers: corsHeaders }); } const lineItemsJson = JSON.stringify(lineItems); try { const stmt = env.USER_DB.prepare( "UPDATE invoices SET customerName = ?, dueDate = ?, status = ?, lineItems = ? WHERE id = ?" ); const info = await stmt.bind(customerName.trim(), dueDate, status, lineItemsJson, id).run(); if (info.success && info.changes > 0) { const updatedInvoice = { id, customerName: customerName.trim(), dueDate, status, lineItems }; return new Response(JSON.stringify({ success: true, invoice: updatedInvoice }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Invoice ${id} not found for update.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 update fail info: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Update Invoice Err:", e); return new Response(JSON.stringify({ success: false, error: `Update invoice failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        async function handleUpdateInvoiceStatus(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { invoiceId, newStatus, paymentMethod, paymentReference } = requestData; if (!invoiceId || typeof invoiceId !== 'string' || !newStatus || !['Pending', 'Paid'].includes(newStatus)) { return new Response(JSON.stringify({ success: false, error: 'Invalid ID or status for this update type (Pending/Paid only).' }), { status: 400, headers: corsHeaders }); } let sql = "UPDATE invoices SET status = ?"; const params = [newStatus]; if (newStatus === 'Paid') { if (!paymentMethod || (paymentMethod !== 'cash' && paymentMethod !== 'bank')) { return new Response(JSON.stringify({ success: false, error: 'Valid paymentMethod ("cash" or "bank") required for Paid status.' }), { status: 400, headers: corsHeaders }); } sql += ", paymentMethod = ?"; params.push(paymentMethod); if (paymentMethod === 'bank') { if (!paymentReference || typeof paymentReference !== 'string' || !paymentReference.trim()) { return new Response(JSON.stringify({ success: false, error: 'Payment reference required for bank transfer.' }), { status: 400, headers: corsHeaders }); } sql += ", paymentReference = ?"; params.push(paymentReference.trim()); } else { sql += ", paymentReference = NULL"; } } else { sql += ", paymentMethod = NULL, paymentReference = NULL"; } sql += " WHERE id = ?"; params.push(invoiceId); try { const stmt = env.USER_DB.prepare(sql); const info = await stmt.bind(...params).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: `Status updated for invoice ${invoiceId}.` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else if (info.success && info.changes === 0) { return new Response(JSON.stringify({ success: false, error: `Invoice ${invoiceId} not found for status update.` }), { status: 404, headers: corsHeaders }); } else { throw new Error("D1 status update fail info: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Update Status Err:", e); return new Response(JSON.stringify({ success: false, error: `Update status failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        async function handleMarkOverdue(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { invoiceId } = requestData; const overdueFee = 30.00; if (!invoiceId || typeof invoiceId !== 'string') { return new Response(JSON.stringify({ success: false, error: 'Invalid Invoice ID.' }), { status: 400, headers: corsHeaders }); } try { const selectStmt = env.USER_DB.prepare("SELECT lineItems FROM invoices WHERE id = ?"); const existingInvoice = await selectStmt.bind(invoiceId).first(); if (!existingInvoice) { return new Response(JSON.stringify({ success: false, error: `Invoice ${invoiceId} not found.` }), { status: 404, headers: corsHeaders }); } let currentLineItems = []; try { if (existingInvoice.lineItems && typeof existingInvoice.lineItems === 'string') { currentLineItems = JSON.parse(existingInvoice.lineItems); } if (!Array.isArray(currentLineItems)) currentLineItems = []; } catch (e) { console.error(`Error parsing existing lineItems for ${invoiceId}:`, e); currentLineItems = []; } const feeAlreadyAdded = currentLineItems.some(item => item.description === 'Overdue Fee'); if (feeAlreadyAdded) { const statusUpdateStmt = env.USER_DB.prepare("UPDATE invoices SET status = 'Overdue' WHERE id = ?"); await statusUpdateStmt.bind(invoiceId).run(); return new Response(JSON.stringify({ success: true, message: `Invoice ${invoiceId} already had fee, marked as Overdue.` }), { status: 200, headers: corsHeaders }); } else { const updatedLineItems = [ ...currentLineItems, { description: 'Overdue Fee', amount: overdueFee } ]; const updatedLineItemsJson = JSON.stringify(updatedLineItems); const updateStmt = env.USER_DB.prepare( "UPDATE invoices SET status = 'Overdue', lineItems = ?, paymentMethod = NULL, paymentReference = NULL WHERE id = ?" ); const info = await updateStmt.bind(updatedLineItemsJson, invoiceId).run(); if (info.success && info.changes > 0) { return new Response(JSON.stringify({ success: true, message: `Invoice ${invoiceId} marked Overdue, $${overdueFee.toFixed(2)} fee added.` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else { throw new Error("D1 Overdue update failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } } catch (e) { console.error("Mark Overdue Err:", e); return new Response(JSON.stringify({ success: false, error: `Failed to mark invoice Overdue: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        // --- In your Cloudflare Worker script ---

        // --- In your Cloudflare Worker script ---
async function handleGetCopilotPlans(req, requestData, env) {
    const { token } = requestData;
    let userId = null;
    
    if (token) {
        const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (verificationResult.success) {
            const userQuery = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(verificationResult.payload.user_id).first();
            if (userQuery) userId = userQuery.id;
        }
    }
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: corsHeaders });

    try {
        // Fetch all plans for this user
        const { results: plans } = await env.USER_DB.prepare("SELECT * FROM learning_plans WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
        
        // For a full production app, you'd do a complex JOIN here, but for this MVP, 
        // we will just return the list of plans. We can attach the raw JSON to the 'goal' column for easy retrieval.
        return new Response(JSON.stringify({ success: true, plans: plans || [] }), { status: 200, headers: corsHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: `Worker error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
// REPLACE THIS ENTIRE FUNCTION
async function handleAdminListUsersWithHistory(req, requestData, env) {
    if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders });
    try {
        const userListStmt = env.USER_DB.prepare(`
            SELECT 
                u.id, 
                u.username, 
                u.email, 
                MAX(cm.timestamp) as last_updated, 
                SUM(LENGTH(cm.content)) as history_size_bytes
            FROM users u 
            JOIN chat_messages cm ON u.id = cm.user_id
            GROUP BY u.id, u.username, u.email 
            ORDER BY last_updated DESC
        `);
        const totalSizeStmt = env.USER_DB.prepare(
            `SELECT SUM(LENGTH(content)) as total_size_bytes FROM chat_messages`
        );

        const [userListResult, totalSizeResult] = await Promise.all([
            userListStmt.all(),
            totalSizeStmt.first()
        ]);
        
        return new Response(JSON.stringify({ 
            success: true, 
            users: userListResult.results || [],
            total_storage_bytes: totalSizeResult?.total_size_bytes || 0
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (e) {
        console.error("Admin ListUsersWithHistory Err:", e);
        return new Response(JSON.stringify({ success: false, error: "Failed to list users with history" }), { status: 500, headers: corsHeaders });
    }
}
        // --- Voucher Handlers ---
        async function handleGetPaymentVouchers(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); try { const { results } = await env.USER_DB.prepare("SELECT * FROM payment_vouchers ORDER BY voucherDate DESC, createdTimestamp DESC").all(); return new Response(JSON.stringify({ success: true, vouchers: results || [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Get Payment Vouchers Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed to get payment vouchers" }), { status: 500, headers: corsHeaders }); } }
        async function handleCreatePaymentVoucher(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { voucherDate, payeeName, description, amount, paymentMethod, referenceNo } = requestData; if (!voucherDate || !payeeName || !description || typeof amount !== 'number' || amount <= 0) { return new Response(JSON.stringify({ success: false, error: 'Missing required fields for payment voucher (date, payee, description, amount).' }), { status: 400, headers: corsHeaders }); } const newId = crypto.randomUUID(); try { const stmt = env.USER_DB.prepare("INSERT INTO payment_vouchers (id, voucherDate, payeeName, description, amount, paymentMethod, referenceNo) VALUES (?, ?, ?, ?, ?, ?, ?)"); const info = await stmt.bind(newId, voucherDate, payeeName, description, amount, paymentMethod || null, referenceNo || null).run(); if (info.success) { const newVoucher = { id: newId, voucherDate, payeeName, description, amount, paymentMethod, referenceNo }; return new Response(JSON.stringify({ success: true, voucher: newVoucher }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else { throw new Error("D1 insert payment voucher failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Create Payment Voucher Err:", e); return new Response(JSON.stringify({ success: false, error: `Create payment voucher failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        async function handleGetReceiveVouchers(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); try { const { results } = await env.USER_DB.prepare("SELECT * FROM receive_vouchers ORDER BY voucherDate DESC, createdTimestamp DESC").all(); return new Response(JSON.stringify({ success: true, vouchers: results || [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch (e) { console.error("Get Receive Vouchers Err:", e); return new Response(JSON.stringify({ success: false, error: "Failed to get receive vouchers" }), { status: 500, headers: corsHeaders }); } }
        async function handleCreateReceiveVoucher(req, requestData, env) { if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB binding missing" }), { status: 500, headers: corsHeaders }); const { voucherDate, payerName, description, amountReceived, paymentMethod, referenceNo, relatedInvoiceId } = requestData; if (!voucherDate || !payerName || !description || typeof amountReceived !== 'number' || amountReceived <= 0) { return new Response(JSON.stringify({ success: false, error: 'Missing required fields for receive voucher (date, payer, description, amount).' }), { status: 400, headers: corsHeaders }); } const newId = crypto.randomUUID(); try { const stmt = env.USER_DB.prepare("INSERT INTO receive_vouchers (id, voucherDate, payerName, description, amountReceived, paymentMethod, referenceNo, relatedInvoiceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"); const info = await stmt.bind(newId, voucherDate, payerName, description, amountReceived, paymentMethod || null, referenceNo || null, relatedInvoiceId || null).run(); if (info.success) { const newVoucher = { id: newId, voucherDate, payerName, description, amountReceived, paymentMethod, referenceNo, relatedInvoiceId }; return new Response(JSON.stringify({ success: true, voucher: newVoucher }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } else { throw new Error("D1 insert receive voucher failed: " + JSON.stringify(info.error || info.meta?.cause || 'Unknown D1 Error')); } } catch (e) { console.error("Create Receive Voucher Err:", e); return new Response(JSON.stringify({ success: false, error: `Create receive voucher failed: ${e.message}` }), { status: 500, headers: corsHeaders }); } }
        
        // --- Main Request Router ---
        if (request.method === 'OPTIONS') { return handleOptions(request); }
        if (request.method !== 'POST') { return new Response('Method Not Allowed', { status: 405, headers: corsHeaders }); }
        if (!request.headers.get('content-type')?.includes('application/json')) { return new Response(JSON.stringify({ error: 'Request must be JSON' }), { status: 415, headers: corsHeaders }); }

        let requestData;
        try { requestData = await request.json(); }
        catch (e) { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders }); }

        if (!env.GEMINI_API_KEY || !env.GOOGLE_TTS_API_KEY || !env.GOOGLE_STT_API_KEY || !env.STAFF_ACCESS_KEY || !env.USER_DB || !env.CHAT_CONFIG_KV) {
            console.error("CRITICAL: Missing required environment bindings!");
            return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: corsHeaders });
        }
        const action = requestData?.action || 'chat';
        const isInvoiceOrVoucherAction = action.startsWith('invoice') || action.startsWith('voucher');
        if (isInvoiceOrVoucherAction && !env.INVOICE_ACCESS_PASSWORD) { console.error("CRITICAL: Missing INVOICE_ACCESS_PASSWORD secret!"); return new Response(JSON.stringify({ error: 'Server configuration error (auth)' }), { status: 500, headers: corsHeaders }); }

        const config = await getConfig(env);
        console.log(`Action Received: ${action}`);

        try {
            let response;
            if (action.startsWith('admin')) { const staffValidation = await isStaffKeyValid(requestData?.staffKey, env); if (!staffValidation.isValid) { const status = staffValidation.error.includes("required") ? 401 : staffValidation.error.includes("config") ? 500 : 403; return new Response(JSON.stringify({ success: false, error: staffValidation.error }), { status: status, headers: corsHeaders }); } }
            else if (isInvoiceOrVoucherAction) { const accessAuth = await checkInvoiceAccess(request, env); if (!accessAuth.authorized) { return new Response(JSON.stringify({ success: false, error: accessAuth.error }), { status: accessAuth.status, headers: corsHeaders }); } }

            switch (action) {
                case 'generateCopilotPlan': 
    response = await handleGenerateCopilotPlan(request, requestData, env); 
    break;
    case 'updateCopilotPlan': 
    response = await handleUpdateCopilotPlan(request, requestData, env); 
    break;
                case 'loginWithFirebase': {
                    const token = requestData?.token;
                    if (!env.FIREBASE_PROJECT_ID) {
                      return new Response(JSON.stringify({ error: "Server config missing: FIREBASE_PROJECT_ID" }), { status: 500, headers: corsHeaders });
                    }
                    
                    const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
                    if (!verificationResult.success) {
                      return new Response(JSON.stringify({ error: verificationResult.error }), { status: 401, headers: corsHeaders });
                    }
                    
                    const firebase_uid = verificationResult.payload.user_id;
                    const name = verificationResult.payload.name || "Anonymous";
                    const email = verificationResult.payload.email || null;
                    const picture = verificationResult.payload.picture || null;
                    
                    try {
                      const userQuery = await env.USER_DB.prepare(
                        "SELECT id FROM users WHERE firebase_uid = ?"
                      ).bind(firebase_uid).first();
                    
                      if (!userQuery) {
                        const newUserId = crypto.randomUUID();
                        await env.USER_DB.prepare(
                          "INSERT INTO users (id, firebase_uid, username, email, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)"
                        ).bind(newUserId, firebase_uid, name, email, picture, new Date().toISOString()).run();
                        console.log(`New user created: ${firebase_uid}`);
                      }
                    
                      return new Response(JSON.stringify({ success: true, message: "User verified successfully." }), { status: 200, headers: corsHeaders });
                    } catch (dbErr) {
                      console.error("DB error in loginWithFirebase:", dbErr);
                      return new Response(JSON.stringify({ error: "Database error during login." }), { status: 500, headers: corsHeaders });
                    }
                }
                case 'getUserProfile': {
                    const token = requestData?.token;
                    if (!env.USER_DB || !env.FIREBASE_PROJECT_ID) return new Response(JSON.stringify({ error: "Server config missing" }), { status: 500, headers: corsHeaders });
                    const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
                    if (!verificationResult.success) return new Response(JSON.stringify({ error: verificationResult.error }), { status: 401, headers: corsHeaders });
                    const firebase_uid = verificationResult.payload.user_id;
                
                    // ✨ MODIFIED QUERY to select the new column
                    const userQuery = env.USER_DB.prepare("SELECT id, firebase_uid, username, email, avatar_url, has_premium_access FROM users WHERE firebase_uid = ?");
                    const dbUser = await userQuery.bind(firebase_uid).first();
                
                    if (!dbUser) return new Response(JSON.stringify({ success: false, error: "User not found in database." }), { status: 404, headers: corsHeaders });
                    return new Response(JSON.stringify({ success: true, user: dbUser }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                // REPLACE THIS CASE BLOCK
case 'getChatHistory': {
    const token = requestData?.token;
    if (!env.USER_DB || !env.FIREBASE_PROJECT_ID) return new Response(JSON.stringify({ error: "Server config missing" }), { status: 500, headers: corsHeaders });
    
    const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if (!verificationResult.success) {
        return new Response(JSON.stringify({ error: verificationResult.error }), { status: 401, headers: corsHeaders });
    }
    
    try {
        const firebase_uid = verificationResult.payload.user_id;
        const userRes = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(firebase_uid).first();
        
        if (!userRes) {
            return new Response(JSON.stringify({ history: [] }), { status: 200, headers: corsHeaders });
        }
        
        const historyRes = await env.USER_DB.prepare(
            "SELECT role, content, timestamp FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC"
        ).bind(userRes.id).all();
        
        const messages = (historyRes.results || []).map(msg => ({
            sender: msg.role === 'model' ? 'bot' : 'user',
            text: msg.content,
            timestamp: new Date(msg.timestamp).getTime()
        }));

        return new Response(JSON.stringify({ history: messages }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch(dbErr) {
        console.error("Get History DB Error:", dbErr);
        return new Response(JSON.stringify({ error: "Database error getting history." }), { status: 500, headers: corsHeaders });
    }
}
                // REPLACE THIS CASE BLOCK
case 'adminGetChatHistory': {
    const { userId } = requestData;
    if (!userId) return new Response(JSON.stringify({ success: false, error: 'User ID is required.' }), { status: 400, headers: corsHeaders });
    
    try {
        const historyRes = await env.USER_DB.prepare("SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC").bind(userId).all();
        
        const messages = (historyRes.results || []).map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }]
        }));

        return new Response(JSON.stringify({ success: true, history: messages }), { status: 200, headers: corsHeaders });
    } catch (e) {
        console.error("Admin Get History Err:", e);
        return new Response(JSON.stringify({ success: false, error: "Failed to get chat history." }), { status: 500, headers: corsHeaders });
    }
}
                // ADD THIS NEW CASE to your worker's switch statement
case 'adminSetUserPermission': {
    const { userId, hasPremiumAccess } = requestData;
    if (!userId || typeof hasPremiumAccess !== 'boolean') {
        return new Response(JSON.stringify({ success: false, error: 'User ID and permission status are required.' }), { status: 400, headers: corsHeaders });
    }
    try {
        const info = await env.USER_DB.prepare("UPDATE users SET has_premium_access = ? WHERE id = ?")
            .bind(hasPremiumAccess ? 1 : 0, userId)
            .run();

        if (info.success && info.changes > 0) {
            return new Response(JSON.stringify({ success: true, message: `User permission updated.` }), { status: 200, headers: corsHeaders });
        } else {
            return new Response(JSON.stringify({ success: false, error: `User not found or permission unchanged.` }), { status: 404, headers: corsHeaders });
        }
    } catch (e) {
        console.error("Admin Set Permission Err:", e);
        return new Response(JSON.stringify({ success: false, error: "Failed to update user permission." }), { status: 500, headers: corsHeaders });
    }
}
                // ✨ AND ADD THIS CASE
                // REPLACE THIS CASE BLOCK
case 'adminClearUserHistory': {
    const { userId } = requestData;
    if (!userId) return new Response(JSON.stringify({ success: false, error: 'User ID is required.' }), { status: 400, headers: corsHeaders });
    
    try {
        const info = await env.USER_DB.prepare("DELETE FROM chat_messages WHERE user_id = ?").bind(userId).run();
        
        if (info.success && info.changes > 0) {
            return new Response(JSON.stringify({ success: true, message: `History for user ${userId} deleted.` }), { status: 200, headers: corsHeaders });
        } else {
            return new Response(JSON.stringify({ success: false, error: `No history found for user ${userId}.` }), { status: 404, headers: corsHeaders });
        }
    } catch (e) {
        console.error("Admin Clear History Err:", e);
        return new Response(JSON.stringify({ success: false, error: "Failed to clear chat history." }), { status: 500, headers: corsHeaders });
    }
}
    

                // REPLACE THIS CASE BLOCK
case 'clearChatHistory': {
    const token = requestData?.token;
    if (!env.USER_DB || !env.FIREBASE_PROJECT_ID) return new Response(JSON.stringify({ error: "Server config missing" }), { status: 500, headers: corsHeaders });
    
    const verificationResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if (!verificationResult.success) {
        return new Response(JSON.stringify({ error: verificationResult.error }), { status: 401, headers: corsHeaders });
    }
    
    try {
        const firebase_uid = verificationResult.payload.user_id;
        const userRes = await env.USER_DB.prepare("SELECT id FROM users WHERE firebase_uid = ?").bind(firebase_uid).first();
        
        if (userRes) {
            await env.USER_DB.prepare("DELETE FROM chat_messages WHERE user_id = ?").bind(userRes.id).run();
        }
        return new Response(JSON.stringify({ success: true, message: "History cleared." }), { status: 200, headers: corsHeaders });
    } catch(dbErr) {
        console.error("Clear History DB Error:", dbErr);
        return new Response(JSON.stringify({ error: "Database error clearing history." }), { status: 500, headers: corsHeaders });
    }
}
                    
async function handleAdminListUsersWithHistory(req, requestData, env) {
    if (!env.USER_DB) return new Response(JSON.stringify({ success: false, error: "DB missing" }), { status: 500, headers: corsHeaders });
    try {
        // ✨ MODIFIED QUERY to include has_premium_access
        const userListStmt = env.USER_DB.prepare(`
            SELECT 
                u.id, 
                u.username, 
                u.email, 
                u.has_premium_access,
                MAX(cm.timestamp) as last_updated, 
                SUM(LENGTH(cm.content)) as history_size_bytes
            FROM users u 
            LEFT JOIN chat_messages cm ON u.id = cm.user_id
            GROUP BY u.id, u.username, u.email, u.has_premium_access
            ORDER BY last_updated DESC
        `);
        const totalSizeStmt = env.USER_DB.prepare(
            `SELECT SUM(LENGTH(content)) as total_size_bytes FROM chat_messages`
        );

        const [userListResult, totalSizeResult] = await Promise.all([
            userListStmt.all(),
            totalSizeStmt.first()
        ]);

        return new Response(JSON.stringify({ 
            success: true, 
            users: userListResult.results || [],
            total_storage_bytes: totalSizeResult?.total_size_bytes || 0
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (e) {
        console.error("Admin ListUsersWithHistory Err:", e);
        return new Response(JSON.stringify({ success: false, error: "Failed to list users with history" }), { status: 500, headers: corsHeaders });
    }
}
case 'adminListUsersWithHistory': 
response = await handleAdminListUsersWithHistory(request, requestData, env); 
break;

                case 'chat': response = await handleChatRequest(request, requestData, env, config); break;
                case 'synthesize_speech': response = await handleSynthesizeSpeechRequest(request, requestData, env); break;
                case 'transcribe_speech': response = await handleTranscribeSpeechRequest(request, requestData, env); break;
                case 'submitFeedback': response = await handleFeedbackSubmit(request, requestData, env); break;
                case 'staffLogin': response = await handleStaffLoginRequest(request, requestData, env); break;
                case 'adminListKeys': response = await handleAdminListKeys(request, requestData, env); break;
                case 'adminUpdateKeyStatus': response = await handleAdminUpdateKeyStatus(request, requestData, env); break;
                case 'adminGetRestrictions': response = await handleAdminGetRestrictions(request, requestData, env); break;
                case 'adminSetRestrictedModels': response = await handleAdminSetRestrictedModels(request, requestData, env); break;
                case 'adminSetRestrictedPersonas': response = await handleAdminSetRestrictedPersonas(request, requestData, env); break;
                case 'adminAddKey': response = await handleAdminAddKey(request, requestData, env); break;
                case 'adminDeleteKey': response = await handleAdminDeleteKey(request, requestData, env); break;
                case 'adminEditUsername': response = await handleAdminEditUsername(request, requestData, env); break;
                case 'adminListFeedback': response = await handleAdminListFeedback(request, requestData, env); break;
                case 'adminMarkFeedbackImportant': response = await handleAdminMarkFeedbackImportant(request, requestData, env); break;
                case 'adminDeleteFeedback': response = await handleAdminDeleteFeedback(request, requestData, env); break;
                case 'adminGetPrompts': response = await handleAdminGetPrompts(request, requestData, env); break;
                case 'adminSetPrompts': response = await handleAdminSetPrompts(request, requestData, env); break;
                case 'invoiceGet': response = await handleGetInvoices(request, requestData, env); break;
                case 'invoiceCreate': response = await handleCreateInvoice(request, requestData, env); break;
                case 'invoiceUpdate': response = await handleUpdateInvoice(request, requestData, env); break;
                case 'invoiceDelete': response = await handleDeleteInvoice(request, requestData, env); break;
                case 'invoiceUpdateStatus': response = await handleUpdateInvoiceStatus(request, requestData, env); break;
                case 'invoiceMarkOverdue': response = await handleMarkOverdue(request, requestData, env); break;
                case 'voucherPaymentGet': response = await handleGetPaymentVouchers(request, requestData, env); break;
                case 'voucherPaymentCreate': response = await handleCreatePaymentVoucher(request, requestData, env); break;
                case 'voucherReceiveGet': response = await handleGetReceiveVouchers(request, requestData, env); break;
                case 'voucherReceiveCreate': response = await handleCreateReceiveVoucher(request, requestData, env); break;
                case 'getCopilotPlans':
    return await handleGetCopilotPlans(request, requestData, env);
                default: console.warn(`Unhandled action received: ${action}`); response = new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });
            }


            if (!response) { console.error(`No response object generated for action: ${action}.`); return new Response(JSON.stringify({ error: `Internal server error: Handler missing for action ${action}` }), { status: 500, headers: corsHeaders }); }
            const finalHeaders = new Headers(response.headers); Object.entries(corsHeaders).forEach(([key, value]) => { if (!finalHeaders.has(key)) { finalHeaders.set(key, value); } });
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers: finalHeaders });
        } catch (routingError) {
            console.error(`Unhandled error processing action "${action}":`, routingError);
            return new Response(JSON.stringify({ error: `Server error processing action: ${action}` }), { status: 500, headers: corsHeaders });
        }
    }
}