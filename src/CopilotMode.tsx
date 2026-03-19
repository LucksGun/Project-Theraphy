import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, WORKER_URL } from './App'; 
import ReactFlow, { Background, Controls, Node, Edge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } });

interface ChatMessage { id: string; text: string; sender: 'user' | 'ai'; }

export default function CopilotMode({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    
    // Core Layout States
    const [savedPlans, setSavedPlans] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'tree' | 'calendar'>('tree');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    
    // Active Plan States
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [planData, setPlanData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    
    // AI Chat & Modification States
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 'welcome', text: 'Hi! I am your Admissions Co-pilot. Tell me your university goals, or select a saved plan. You can chat with me anytime to modify your roadmap!', sender: 'ai' }]);
    const [prompt, setPrompt] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Context Panel (Recommendations)
    const [selectedRecs, setSelectedRecs] = useState<any[] | null>(null);
    const [selectedNodeTitle, setSelectedNodeTitle] = useState<string>('');

    // 1. Fetch Plans on Mount
    useEffect(() => {
        const fetchPlans = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch(WORKER_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getCopilotPlans', token })
                });
                const data = await res.json();
                if (data.success) setSavedPlans(data.plans);
            } catch (err) { console.error("Failed to fetch plans", err); }
        };
        fetchPlans();
    }, [user]);

    // Scroll Chat
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

    // 2. The Universal Map Renderer
    const renderMapAndCalendar = useCallback((generatedPlan: any) => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const newEvents: any[] = [];
        let rollingDate = new Date(); 

        generatedPlan.nodes.forEach((node: any, index: number) => {
            newNodes.push({
                id: node.node_id,
                position: { x: 250 + (index % 2 === 0 ? 0 : 150), y: (index + 1) * 160 }, // Staggered layout
                data: { label: node.title, recommendations: node.recommendations },
                style: { 
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '12px', 
                    padding: '16px', width: 260, textAlign: 'center',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
                    fontWeight: '600', fontSize: '14px'
                }
            });

            if (node.prerequisites && node.prerequisites.length > 0) {
                node.prerequisites.forEach((prereqId: string) => {
                    newEdges.push({
                        id: `e-${prereqId}-${node.node_id}`, source: prereqId, target: node.node_id,
                        animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
                    });
                });
            }

            if (node.calendar_events && node.calendar_events.length > 0) {
                node.calendar_events.forEach((event: any) => {
                    const startDate = new Date(rollingDate);
                    const endDate = addDays(startDate, event.duration_days || 1);
                    newEvents.push({ title: `${node.title}: ${event.title}`, start: startDate, end: endDate, allDay: true });
                    rollingDate = endDate; 
                });
            }
        });

        setNodes(newNodes); setEdges(newEdges); setCalendarEvents(newEvents);
    }, []);

    // 3. Handle Chat Submission (Creates OR Modifies)
    const handleSendPrompt = async () => {
        if (!prompt.trim() || !user || isProcessing) return;
        
        const userMsg = prompt;
        setPrompt('');
        setChatMessages(prev => [...prev, { id: Date.now().toString(), text: userMsg, sender: 'user' }]);
        setIsProcessing(true);

        try {
            const token = await user.getIdToken();
            const res = await fetch(WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'generateCopilotPlan', 
                    token, 
                    prompt: userMsg,
                    planId: activePlanId, // Pass ID if modifying
                    currentPlanJson: planData ? JSON.stringify(planData) : null // Pass context
                })
            });
            
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed");
            
            const generatedPlan = data.plan_data;
            setPlanData(generatedPlan);
            setActivePlanId(data.plan_id);
            renderMapAndCalendar(generatedPlan);
            
            setChatMessages(prev => [...prev, { id: Date.now().toString(), text: `I've updated the roadmap! Check the main canvas to see the changes.`, sender: 'ai' }]);

            // Refresh sidebar quietly
            setSavedPlans(prev => {
                const existing = prev.filter(p => p.id !== data.plan_id);
                return [{ id: data.plan_id, title: generatedPlan.plan_title, plan_data: generatedPlan }, ...existing];
            });

        } catch (error: any) {
            setChatMessages(prev => [...prev, { id: Date.now().toString(), text: `Error: ${error.message}`, sender: 'ai' }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const loadPlan = (plan: any) => {
        setActivePlanId(plan.id);
        setPlanData(plan.plan_data);
        renderMapAndCalendar(plan.plan_data);
        setChatMessages([{ id: Date.now().toString(), text: `Loaded "${plan.title}". How would you like to modify this plan?`, sender: 'ai' }]);
    };

    const handleNewPlan = () => {
        setActivePlanId(null); setPlanData(null); setNodes([]); setEdges([]); setCalendarEvents([]);
        setChatMessages([{ id: Date.now().toString(), text: 'Starting fresh! What is your new goal?', sender: 'ai' }]);
    };

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.data?.recommendations) {
            setSelectedNodeTitle(node.data.label);
            setSelectedRecs(node.data.recommendations);
        } else { setSelectedRecs(null); }
    }, []);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
            
            {/* PANE 1: LEFT SIDEBAR (History) */}
            <div style={{ width: isSidebarOpen ? '260px' : '0px', transition: 'width 0.3s', overflow: 'hidden', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2em', color: '#0f172a', fontWeight: 'bold' }}>🎓 Co-pilot</h2>
                    </div>
                    <button onClick={handleNewPlan} style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                        <span>+</span> New Roadmap
                    </button>
                </div>
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '15px' }}>
                    <p style={{ fontSize: '0.75em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '10px' }}>Your Saved Paths</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {savedPlans.map(plan => (
                            <button key={plan.id} onClick={() => loadPlan(plan)} style={{ textAlign: 'left', padding: '12px 10px', backgroundColor: activePlanId === plan.id ? '#e0f2fe' : 'transparent', color: activePlanId === plan.id ? '#0369a1' : '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9em', fontWeight: activePlanId === plan.id ? '600' : '400', transition: 'all 0.2s' }}>
                                📄 {plan.title}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* PANE 2: CENTER CANVAS (The Work Area) */}
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                
                {/* Header Navbar */}
                <div style={{ height: '60px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px' }}>
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', fontSize: '1.2em', cursor: 'pointer', color: '#64748b' }}>☰</button>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1em', fontWeight: '600', flexGrow: 1 }}>{planData ? planData.plan_title : 'Untitled Roadmap'}</h3>
                    
                    {planData && (
                        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                            <button onClick={() => setActiveTab('tree')} style={{ background: activeTab === 'tree' ? '#ffffff' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.9em', fontWeight: activeTab === 'tree' ? '600' : '500', color: activeTab === 'tree' ? '#0f172a' : '#64748b', cursor: 'pointer', boxShadow: activeTab === 'tree' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Roadmap</button>
                            <button onClick={() => setActiveTab('calendar')} style={{ background: activeTab === 'calendar' ? '#ffffff' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.9em', fontWeight: activeTab === 'calendar' ? '600' : '500', color: activeTab === 'calendar' ? '#0f172a' : '#64748b', cursor: 'pointer', boxShadow: activeTab === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Calendar</button>
                        </div>
                    )}
                    <button onClick={onClose} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Exit Co-pilot</button>
                </div>

                {/* Main View Area */}
                <div style={{ flexGrow: 1, position: 'relative' }}>
                    {!planData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', textAlign: 'center', padding: '20px' }}>
                            <div style={{ fontSize: '3em', marginBottom: '15px' }}>✨</div>
                            <h2 style={{ color: '#0f172a', marginBottom: '10px' }}>Your blank canvas awaits.</h2>
                            <p style={{ maxWidth: '400px', lineHeight: '1.5' }}>Use the AI Assistant on the right to describe your academic goals. I will instantly build a custom roadmap here.</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'tree' && (
                                <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView attributionPosition="bottom-left">
                                    <Background color="#cbd5e1" gap={20} size={2} />
                                    <Controls style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderRadius: '8px', overflow: 'hidden' }} />
                                </ReactFlow>
                            )}
                            {activeTab === 'calendar' && (
                                <div style={{ padding: '20px', height: '100%', backgroundColor: '#ffffff' }}>
                                    <Calendar localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" views={['month', 'week', 'agenda']} style={{ height: '100%', color: '#0f172a' }} />
                                </div>
                            )}

                            {/* Node Details Overlay */}
                            {selectedRecs && activeTab === 'tree' && (
                                <div style={{ position: 'absolute', top: 20, left: 20, width: '320px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', zIndex: 5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1.1em' }}>{selectedNodeTitle}</h4>
                                        <button onClick={() => setSelectedRecs(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>✕</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {selectedRecs.map((rec: any, idx: number) => (
                                            <div key={idx} style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                                <strong style={{ display: 'block', color: '#1e293b', fontSize: '0.95em', marginBottom: '4px' }}>{rec.name}</strong>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8em', color: '#64748b' }}>
                                                    <span>{rec.type}</span>
                                                    <span style={{ color: '#059669', fontWeight: 'bold' }}>{rec.estimated_price}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* PANE 3: RIGHT PANEL (AI Assistant Chat) */}
            <div style={{ width: '340px', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '-4px 0 15px rgba(0,0,0,0.02)' }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '1em', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
                        AI Assistant
                    </h3>
                </div>
                
                {/* Chat History */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {chatMessages.map(msg => (
                        <div key={msg.id} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                            <div style={{ backgroundColor: msg.sender === 'user' ? '#3b82f6' : '#f1f5f9', color: msg.sender === 'user' ? '#ffffff' : '#334155', padding: '12px 16px', borderRadius: msg.sender === 'user' ? '16px 16px 0 16px' : '16px 16px 16px 0', fontSize: '0.95em', lineHeight: '1.5', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isProcessing && (
                        <div style={{ alignSelf: 'flex-start', backgroundColor: '#f1f5f9', padding: '12px 16px', borderRadius: '16px 16px 16px 0', color: '#64748b', fontSize: '0.9em', display: 'flex', gap: '4px' }}>
                            <span className="dot-pulse">●</span><span className="dot-pulse" style={{ animationDelay: '0.2s'}}>●</span><span className="dot-pulse" style={{ animationDelay: '0.4s'}}>●</span>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div style={{ padding: '15px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '24px', padding: '4px 8px 4px 16px', transition: 'border-color 0.2s' }}>
                        <input 
                            type="text" 
                            value={prompt} 
                            onChange={(e) => setPrompt(e.target.value)} 
                            onKeyPress={(e) => { if (e.key === 'Enter') handleSendPrompt(); }}
                            placeholder={planData ? "Ask to modify..." : "Generate roadmap for..."}
                            disabled={isProcessing}
                            style={{ flexGrow: 1, border: 'none', background: 'transparent', outline: 'none', color: '#0f172a', fontSize: '0.95em' }}
                        />
                        <button onClick={handleSendPrompt} disabled={isProcessing || !prompt.trim()} style={{ backgroundColor: prompt.trim() ? '#3b82f6' : '#94a3b8', color: 'white', border: 'none', borderRadius: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: prompt.trim() ? 'pointer' : 'default', transition: 'background-color 0.2s' }}>
                            ↑
                        </button>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.75em', color: '#94a3b8', margin: '8px 0 0 0' }}>AI can make mistakes. Verify information.</p>
                </div>
            </div>

            <style>{`
                @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
                .dot-pulse { animation: pulse 1s infinite; display: inline-block; }
            `}</style>
        </div>
    );
}