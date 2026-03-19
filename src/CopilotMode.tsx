import { useState, useEffect, useCallback } from 'react';
import { useAuth, WORKER_URL } from './App'; 
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function CopilotMode({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const [savedPlans, setSavedPlans] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'tree' | 'calendar'>('tree');
    
    // UI States
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Core Data State
    const [planData, setPlanData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    
    // Recommendations Panel
    const [selectedRecs, setSelectedRecs] = useState<any[] | null>(null);
    const [selectedNodeTitle, setSelectedNodeTitle] = useState<string>('');

    // Load saved plans on mount
    useEffect(() => {
        const fetchPlans = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getCopilotPlans', token })
                });
                const data = await res.json();
                if (data.success && data.plans) {
                    setSavedPlans(data.plans);
                }
            } catch (err) {
                console.error("Failed to fetch saved plans", err);
            }
        };
        fetchPlans();
    }, [user]);

    const generatePlan = async () => {
        if (!prompt.trim() || !user) return alert("Please enter your academic goal.");
        
        setIsLoading(true);
        setSelectedRecs(null);
        setSelectedNodeTitle('');

        try {
            const token = await user.getIdToken();
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generateCopilotPlan', token, prompt })
            });
            
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed to generate plan");
            
            const generatedPlan = data.plan_data;
            setPlanData(generatedPlan);
            mapDataToUI(generatedPlan);
            setIsCreatingNew(false); // Close the modal
            
            // Optimistically update sidebar
            setSavedPlans(prev => [{ id: data.plan_id, title: generatedPlan.plan_title, created_at: new Date().toISOString() }, ...prev]);

        } catch (error: any) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const mapDataToUI = (generatedPlan: any) => {
        const newFlowNodes: Node[] = [];
        const newFlowEdges: Edge[] = [];
        const newCalEvents: any[] = [];
        let rollingDate = new Date(); 

        generatedPlan.nodes.forEach((node: any, index: number) => {
            // Distinct styling for a modern look
            newFlowNodes.push({
                id: node.node_id,
                position: { x: 300, y: (index + 1) * 150 }, 
                data: { label: node.title, recommendations: node.recommendations },
                style: { 
                    backgroundColor: '#ffffff', color: '#111827', 
                    border: '2px solid #3b82f6', borderRadius: '12px', 
                    padding: '15px', width: 250, textAlign: 'center',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    fontWeight: 'bold'
                }
            });

            if (node.prerequisites && node.prerequisites.length > 0) {
                node.prerequisites.forEach((prereqId: string) => {
                    newFlowEdges.push({
                        id: `e-${prereqId}-${node.node_id}`,
                        source: prereqId,
                        target: node.node_id,
                        animated: true,
                        style: { stroke: '#3b82f6', strokeWidth: 3 } 
                    });
                });
            }

            if (node.calendar_events && node.calendar_events.length > 0) {
                node.calendar_events.forEach((event: any) => {
                    const startDate = new Date(rollingDate);
                    const endDate = addDays(startDate, event.duration_days || 1);
                    newCalEvents.push({ title: `${node.title}: ${event.title}`, start: startDate, end: endDate, allDay: true });
                    rollingDate = endDate; 
                });
            }
        });

        setNodes(newFlowNodes);
        setEdges(newFlowEdges);
        setCalendarEvents(newCalEvents);
    };

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.data && node.data.recommendations) {
            setSelectedNodeTitle(node.data.label);
            setSelectedRecs(node.data.recommendations);
        } else {
            setSelectedRecs(null);
        }
    }, []);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
            
            {/* LEFT SIDEBAR: Navigation & Saved Plans */}
            <div style={{ width: '280px', backgroundColor: '#1f2937', color: 'white', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 15px rgba(0,0,0,0.1)', zIndex: 10 }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #374151' }}>
                    <h2 style={{ margin: '0 0 15px 0', fontSize: '1.2em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        🎓 Uni Co-pilot
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2em' }}>✕</button>
                    </h2>
                    <button 
                        onClick={() => setIsCreatingNew(true)} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        + New Roadmap
                    </button>
                </div>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '15px' }}>
                    <h3 style={{ fontSize: '0.9em', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>My Roadmaps</h3>
                    {savedPlans.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '0.85em' }}>No saved roadmaps yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {savedPlans.map(plan => (
                                <button key={plan.id} style={{ textAlign: 'left', padding: '10px', backgroundColor: '#374151', color: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    {plan.title}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                
                {/* Header Tabs */}
                {planData && (
                    <div style={{ display: 'flex', backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '15px 30px', gap: '20px', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, color: '#111827', fontSize: '1.3em', marginRight: 'auto' }}>{planData.plan_title}</h2>
                        <button onClick={() => setActiveTab('tree')} style={{ background: 'none', border: 'none', padding: '8px 15px', fontSize: '1em', fontWeight: activeTab === 'tree' ? 'bold' : 'normal', color: activeTab === 'tree' ? '#3b82f6' : '#6b7280', borderBottom: activeTab === 'tree' ? '2px solid #3b82f6' : 'none', cursor: 'pointer' }}>
                            🗺️ Roadmap View
                        </button>
                        <button onClick={() => setActiveTab('calendar')} style={{ background: 'none', border: 'none', padding: '8px 15px', fontSize: '1em', fontWeight: activeTab === 'calendar' ? 'bold' : 'normal', color: activeTab === 'calendar' ? '#3b82f6' : '#6b7280', borderBottom: activeTab === 'calendar' ? '2px solid #3b82f6' : 'none', cursor: 'pointer' }}>
                            📅 Schedule View
                        </button>
                    </div>
                )}

                {/* Main Render Area */}
                <div style={{ flexGrow: 1, position: 'relative' }}>
                    
                    {!planData && !isCreatingNew && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                            <span style={{ fontSize: '4em', marginBottom: '20px' }}>🏛️</span>
                            <h2>Welcome to your Admissions Co-pilot</h2>
                            <p>Click "+ New Roadmap" to map out your university journey.</p>
                        </div>
                    )}

                    {planData && activeTab === 'tree' && (
                        <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView>
                            <Background color="#cbd5e1" gap={16} />
                            <Controls />
                        </ReactFlow>
                    )}
                    
                    {planData && activeTab === 'calendar' && (
                        <div style={{ padding: '20px', height: '100%', backgroundColor: 'white' }}>
                            <Calendar localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" views={['month', 'week', 'agenda']} style={{ height: '100%', color: '#111827' }} />
                        </div>
                    )}
                </div>

                {/* SLIDE-IN RECOMMENDATIONS PANEL */}
                {selectedRecs && activeTab === 'tree' && (
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '350px', backgroundColor: 'white', boxShadow: '-4px 0 15px rgba(0,0,0,0.05)', padding: '25px', overflowY: 'auto', zIndex: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: '#111827' }}>Resources</h3>
                            <button onClick={() => setSelectedRecs(null)} style={{ background: 'none', border: 'none', fontSize: '1.2em', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
                        </div>
                        <p style={{ color: '#6b7280', fontSize: '0.9em', marginBottom: '20px' }}>Action items for: <strong>{selectedNodeTitle}</strong></p>
                        
                        {selectedRecs.length === 0 ? (
                            <p style={{ color: '#9ca3af' }}>No external resources needed. Focus on self-study.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {selectedRecs.map((rec: any, idx: number) => (
                                    <div key={idx} style={{ padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        <strong style={{ display: 'block', color: '#1e293b', marginBottom: '5px' }}>{rec.name}</strong>
                                        <span style={{ fontSize: '0.85em', color: '#64748b', display: 'block' }}>Type: {rec.type}</span>
                                        <span style={{ fontSize: '0.85em', color: '#10b981', display: 'block', fontWeight: 'bold', marginTop: '3px' }}>{rec.estimated_price}</span>
                                        {rec.url && (
                                            <a href={rec.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '10px', fontSize: '0.85em', color: '#fff', backgroundColor: '#3b82f6', padding: '6px 12px', borderRadius: '4px', textDecoration: 'none' }}>
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

            {/* CREATE NEW PLAN MODAL */}
            {isCreatingNew && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h2 style={{ margin: '0 0 15px 0', color: '#111827' }}>Create Admissions Roadmap</h2>
                        <p style={{ color: '#6b7280', fontSize: '0.9em', marginBottom: '20px' }}>Tell me your target university, major, current GPA, and timeline. I'll build the strategy.</p>
                        
                        <textarea 
                            rows={5} 
                            placeholder="e.g., I want to apply to Chula Engineering. My GPA is 3.2. I have 6 months left. I need to build a portfolio and prep for TGAT/TPAT3."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            disabled={isLoading}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', resize: 'none', marginBottom: '20px', fontFamily: 'inherit' }}
                        />
                        
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setIsCreatingNew(false)} disabled={isLoading} style={{ padding: '10px 15px', backgroundColor: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                            <button onClick={generatePlan} disabled={isLoading} style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {isLoading ? 'Analyzing Requirements...' : 'Generate Roadmap'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}