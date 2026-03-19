import { useState, useCallback } from 'react';
import { useAuth, WORKER_URL } from './App'; 
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Setup Calendar Localizer for react-big-calendar using date-fns v3
const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function CopilotMode({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'tree' | 'calendar'>('tree');
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Core Data State
    const [planData, setPlanData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([{ id: '1', position: { x: 250, y: 50 }, data: { label: 'Start Your Journey' } }]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    
    // Recommendations State (Populates when a user clicks a node)
    const [selectedRecs, setSelectedRecs] = useState<any[] | null>(null);
    const [selectedNodeTitle, setSelectedNodeTitle] = useState<string>('');

    const generatePlan = async () => {
        if (!prompt.trim() || !user) {
            alert("Please enter a goal and ensure you are logged in.");
            return;
        }
        
        setIsLoading(true);
        setSelectedRecs(null);
        setSelectedNodeTitle('');

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
            
            const generatedPlan = data.plan_data;
            setPlanData(generatedPlan);
            
            // --- 1. Map Skill Tree Nodes & Edges ---
            const newFlowNodes: Node[] = [];
            const newFlowEdges: Edge[] = [];

            generatedPlan.nodes.forEach((node: any, index: number) => {
                newFlowNodes.push({
                    id: node.node_id,
                    position: { x: 250, y: (index + 1) * 120 }, // Vertical spacing
                    data: { 
                        label: node.title,
                        recommendations: node.recommendations // Store recs inside the node data
                    },
                    style: { backgroundColor: 'var(--bot-bubble-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', width: 200, textAlign: 'center' }
                });

                if (node.prerequisites && node.prerequisites.length > 0) {
                    node.prerequisites.forEach((prereqId: string) => {
                        newFlowEdges.push({
                            id: `e-${prereqId}-${node.node_id}`,
                            source: prereqId,
                            target: node.node_id,
                            animated: true,
                            style: { stroke: '#10b981', strokeWidth: 2 } 
                        });
                    });
                }
            });

            setNodes(newFlowNodes);
            setEdges(newFlowEdges);

            // --- 2. Map Calendar Events ---
            const newCalEvents: any[] = [];
            let rollingDate = new Date(); 

            generatedPlan.nodes.forEach((node: any) => {
                if (node.calendar_events && node.calendar_events.length > 0) {
                    node.calendar_events.forEach((event: any) => {
                        const startDate = new Date(rollingDate);
                        const endDate = addDays(startDate, event.duration_days || 1);
                        
                        newCalEvents.push({
                            title: `${node.title}: ${event.title}`, 
                            start: startDate,
                            end: endDate,
                            allDay: true
                        });
                        rollingDate = endDate; 
                    });
                }
            });

            setCalendarEvents(newCalEvents);

        } catch (error: any) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle clicking a node to show recommendations
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.data && node.data.recommendations) {
            setSelectedNodeTitle(node.data.label);
            setSelectedRecs(node.data.recommendations);
        } else {
            setSelectedRecs(null);
        }
    }, []);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary)' }}>
            
            {/* LEFT PANEL: Chat, Input, and Recommendations */}
            <div style={{ width: '35%', minWidth: '300px', borderRight: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ margin: 0 }}>🚀 Co-pilot</h2>
                    {/* EXIT BUTTON */}
                    <button 
                        onClick={onClose} 
                        className="settings-action-button" 
                        style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 15px', fontWeight: 'bold' }}
                    >
                        Close Copilot
                    </button>
                </div>
                
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginBottom: '20px' }}>
                    Describe your learning goal, budget, and timeline. I will build a curriculum, schedule it, and find the best resources.
                </p>
                
                {/* Scrollable Content Area */}
                <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '10px' }}>
                    {planData && (
                        <div style={{ padding: '15px', backgroundColor: 'var(--bot-bubble-bg)', borderRadius: '10px', marginBottom: '20px', border: '1px solid #10b981' }}>
                            <h3 style={{ margin: '0 0 10px 0', color: '#10b981' }}>{planData.plan_title}</h3>
                            <p style={{ margin: 0, fontSize: '0.9em' }}>Plan generated! Click on the Skill Tree nodes to view specific course recommendations.</p>
                        </div>
                    )}

                    {/* Place/Course Recommendations Panel */}
                    {selectedRecs && (
                        <div style={{ padding: '15px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 15px 0' }}>Resources for: {selectedNodeTitle}</h4>
                            {selectedRecs.length === 0 ? (
                                <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>No specific resources found for this step.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {selectedRecs.map((rec: any, idx: number) => (
                                        <div key={idx} style={{ padding: '10px', backgroundColor: 'var(--bot-bubble-bg)', borderRadius: '6px' }}>
                                            <strong style={{ display: 'block', marginBottom: '5px' }}>{rec.name}</strong>
                                            <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)', display: 'block' }}>Type: {rec.type} | Price: {rec.estimated_price}</span>
                                            {rec.url && (
                                                <a href={rec.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85em', color: '#3b82f6', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }}>
                                                    View Resource →
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <textarea 
                        className="settings-input" 
                        rows={4} 
                        placeholder="e.g., I want to get into KMITL IT. My GPA is 2.5."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isLoading}
                        style={{ resize: 'none' }}
                    />
                    <button onClick={generatePlan} className="send-button" style={{ width: '100%', borderRadius: '8px', padding: '12px', fontWeight: 'bold' }} disabled={isLoading}>
                        {isLoading ? 'Architecting Plan...' : 'Generate Plan'}
                    </button>
                </div>
            </div>

            {/* RIGHT PANEL: Visual Dashboards */}
            <div style={{ width: '65%', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '10px 20px', gap: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                    <button onClick={() => setActiveTab('tree')} className={`settings-action-button ${activeTab === 'tree' ? 'selected' : ''}`} style={activeTab === 'tree' ? { backgroundColor: 'var(--bot-bubble-bg)', borderColor: '#10b981' } : {}}>
                        🌳 Skill Tree
                    </button>
                    <button onClick={() => setActiveTab('calendar')} className={`settings-action-button ${activeTab === 'calendar' ? 'selected' : ''}`} style={activeTab === 'calendar' ? { backgroundColor: 'var(--bot-bubble-bg)', borderColor: '#10b981' } : {}}>
                        📅 Calendar
                    </button>
                </div>

                {/* Dashboard Rendering Area */}
                <div style={{ flexGrow: 1, position: 'relative' }}>
                    {activeTab === 'tree' && (
                        <ReactFlow 
                            nodes={nodes} 
                            edges={edges} 
                            onNodeClick={onNodeClick}
                            fitView
                        >
                            <Background />
                            <Controls />
                        </ReactFlow>
                    )}
                    
                    {activeTab === 'calendar' && (
                        <div style={{ padding: '20px', height: '100%' }}>
                            <Calendar
                                localizer={localizer}
                                events={calendarEvents} 
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: '100%', color: 'var(--text-primary)' }}
                                views={['month', 'week', 'agenda']}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}