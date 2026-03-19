import React, { useState, useCallback } from 'react';
import { useAuth } from './App'; // Adjust path if needed
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { WORKER_URL } from './App';

// Setup Calendar Localizer
const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function CopilotMode({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'tree' | 'calendar'>('tree');
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // State to hold the AI's generated plan
    const [planData, setPlanData] = useState<any>(null);

    // React Flow initial state (we will populate this from the AI data later)
    const [nodes, setNodes] = useState([{ id: '1', position: { x: 250, y: 5 }, data: { label: 'Start Your Journey' } }]);
    const [edges, setEdges] = useState([]);

    const generatePlan = async () => {
        if (!prompt.trim() || !user) return alert("Please enter a goal and ensure you are logged in.");
        
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateCopilotPlan',
                    token: token,
                    prompt: prompt
                })
            });
            
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed to generate plan");
            
            console.log("AI Plan Data:", data);
            setPlanData(data.plan_data);
            alert("Plan generated! Check the console to see the raw JSON.");
            
            // TODO: Next step is mapping this JSON to the reactflow and calendar state!
            
        } catch (error: any) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary)' }}>
            
            {/* LEFT PANEL: The AI Chat & Input */}
            <div style={{ width: '30%', borderRight: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Learning Co-pilot</h2>
                    <button onClick={onClose} className="settings-action-button">Exit</button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Tell me what you want to learn, and I will build a curriculum, calendar, and find resources.</p>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', marginTop: '20px' }}>
                    {/* We will render chat history or plan summary here later */}
                    {planData && (
                        <div style={{ padding: '15px', backgroundColor: 'var(--bot-bubble-bg)', borderRadius: '10px' }}>
                            <h3>{planData.plan_title}</h3>
                            <p>Plan created successfully! (UI mapping coming next)</p>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <textarea 
                        className="settings-input" 
                        rows={4} 
                        placeholder="e.g., I want to learn Full-Stack Web Development in 3 months. My budget is $100."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isLoading}
                    />
                    <button onClick={generatePlan} className="send-button" style={{ width: '100%', borderRadius: '8px' }} disabled={isLoading}>
                        {isLoading ? 'Architecting Plan...' : 'Generate Plan'}
                    </button>
                </div>
            </div>

            {/* RIGHT PANEL: The Visual Dashboards */}
            <div style={{ width: '70%', display: 'flex', flexDirection: 'column' }}>
                
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '10px 20px', gap: '10px' }}>
                    <button onClick={() => setActiveTab('tree')} className={`settings-action-button ${activeTab === 'tree' ? 'selected' : ''}`}>🌳 Skill Tree</button>
                    <button onClick={() => setActiveTab('calendar')} className={`settings-action-button ${activeTab === 'calendar' ? 'selected' : ''}`}>📅 Calendar</button>
                </div>

                {/* Dashboard Area */}
                <div style={{ flexGrow: 1, position: 'relative' }}>
                    {activeTab === 'tree' && (
                        <ReactFlow nodes={nodes} edges={edges}>
                            <Background />
                            <Controls />
                        </ReactFlow>
                    )}
                    
                    {activeTab === 'calendar' && (
                        <div style={{ padding: '20px', height: '100%' }}>
                            <Calendar
                                localizer={localizer}
                                events={[]} // We will map calendar_events here
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: '100%', color: 'var(--text-primary)' }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}