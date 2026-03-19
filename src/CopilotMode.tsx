import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, WORKER_URL } from './App'; 
import ReactFlow, { Background, Controls, Node, Edge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, isWithinInterval, startOfDay} from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } });
interface ChatMessage { id: string; text: string; sender: 'user' | 'ai'; }

export default function CopilotMode({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    
    // Core Layout States
    const [savedPlans, setSavedPlans] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'today' | 'tree' | 'calendar'>('today'); // Default to Today
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    
    // Active Plan States
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [planData, setPlanData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    const [todayTasks, setTodayTasks] = useState<any[]>([]);
    
    // AI Chat & Modification States
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 'welcome', text: 'Welcome to Mission Control! 🚀 Tell me your university goals, or select a saved plan to view your daily tasks.', sender: 'ai' }]);
    const [prompt, setPrompt] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Context Panel (Recommendations)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);

    // 1. Fetch Plans on Mount
    useEffect(() => {
        const fetchPlans = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getCopilotPlans', token }) });
                const data = await res.json();
                if (data.success) setSavedPlans(data.plans);
            } catch (err) { console.error(err); }
        };
        fetchPlans();
    }, [user]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

// 2. The Universal Map & Task Renderer
    const renderMapAndCalendar = useCallback((generatedPlan: any) => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const newEvents: any[] = [];
        const activeTasksForToday: any[] = [];
        
        let rollingDate = startOfDay(new Date()); 

        generatedPlan.nodes.forEach((node: any, index: number) => {
            const isCompleted = node.status === 'completed';
            
            // Build Node
            newNodes.push({
                id: node.node_id,
                position: { x: 250 + (index % 2 === 0 ? 0 : 180), y: (index + 1) * 160 },
                data: { label: isCompleted ? `✅ ${node.title}` : node.title, rawData: node },
                style: { 
                    background: isCompleted ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    color: isCompleted ? '#ffffff' : '#0f172a', 
                    border: isCompleted ? '1px solid #047857' : '1px solid #cbd5e1', 
                    borderRadius: '16px', padding: '16px', width: 260, textAlign: 'center',
                    boxShadow: isCompleted ? '0 10px 25px -5px rgba(16, 185, 129, 0.4)' : '0 10px 15px -3px rgba(0, 0, 0, 0.05)', 
                    fontWeight: '600', fontSize: '14px', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }
            });

            // Build Edges
            if (node.prerequisites && node.prerequisites.length > 0) {
                node.prerequisites.forEach((prereqId: string) => {
                    const prereqNode = generatedPlan.nodes.find((n:any) => n.node_id === prereqId);
                    const isPrereqDone = prereqNode?.status === 'completed';
                    newEdges.push({
                        id: `e-${prereqId}-${node.node_id}`, source: prereqId, target: node.node_id,
                        animated: !isPrereqDone, 
                        style: { stroke: isPrereqDone ? '#10b981' : '#cbd5e1', strokeWidth: isPrereqDone ? 3 : 2 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: isPrereqDone ? '#10b981' : '#cbd5e1' }
                    });
                });
            }

            // Build Calendar Events & Detect Today's Tasks
            if (node.calendar_events && node.calendar_events.length > 0) {
                node.calendar_events.forEach((event: any) => {
                    // Use actual dates from AI if provided, otherwise fallback to rolling dates
                    const startDate = event.start_date ? new Date(event.start_date) : new Date(rollingDate);
                    const endDate = event.end_date ? new Date(event.end_date) : addDays(startDate, event.duration_days || 1);
                    
                    newEvents.push({ 
                        title: `${isCompleted ? '✅ ' : ''}${node.title}: ${event.title}`, 
                        start: startDate, end: endDate, allDay: true, resource: node
                    });

                    // Check if this event falls on TODAY and is NOT completed
                    if (!isCompleted && isWithinInterval(new Date(), { start: startDate, end: endDate })) {
                        // Calculate recommended hours properly
                        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const calculatedHrs = diffDays < 3 ? 3 : 1.5;

                        activeTasksForToday.push({
                            nodeId: node.node_id,
                            parentTitle: node.title,
                            taskTitle: event.title,
                            recommendedHours: calculatedHrs, // We are successfully using the variable now!
                            status: 'todo',
                            resources: node.recommendations
                        });
                    }
                    rollingDate = endDate; 
                });
            }
        });

        setNodes(newNodes); setEdges(newEdges); setCalendarEvents(newEvents); setTodayTasks(activeTasksForToday);
    }, []);       
    

    // 3. Handle Plan Generation/Modification
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
                body: JSON.stringify({ action: 'generateCopilotPlan', token, prompt: userMsg, planId: activePlanId, currentPlanJson: planData ? JSON.stringify(planData) : null })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed");
            
            setPlanData(data.plan_data); setActivePlanId(data.plan_id); renderMapAndCalendar(data.plan_data);
            setChatMessages(prev => [...prev, { id: Date.now().toString(), text: `Roadmap generated and synced! Check your 'Today' tab for your immediate tasks.`, sender: 'ai' }]);
            
            setSavedPlans(prev => {
                const existing = prev.filter(p => p.id !== data.plan_id);
                return [{ id: data.plan_id, title: data.plan_data.plan_title, plan_data: data.plan_data }, ...existing];
            });
            setActiveTab('today'); // Auto-switch to today view on new plan
        } catch (error: any) {
            setChatMessages(prev => [...prev, { id: Date.now().toString(), text: `Error: ${error.message}`, sender: 'ai' }]);
        } finally { setIsProcessing(false); }
    };

    // 4. Mark Node as Complete
    const toggleNodeCompletion = async (nodeId: string) => {
        if (!planData || !activePlanId || !user) return;
        const updatedPlanData = JSON.parse(JSON.stringify(planData));
        const targetNode = updatedPlanData.nodes.find((n: any) => n.node_id === nodeId);
        
        if (targetNode) {
            targetNode.status = targetNode.status === 'completed' ? 'todo' : 'completed';
            setPlanData(updatedPlanData);
            renderMapAndCalendar(updatedPlanData);
            if (selectedNodeId === nodeId) setSelectedNodeData(targetNode); 

            try {
                const token = await user.getIdToken();
                fetch(WORKER_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'updateCopilotPlan', token, planId: activePlanId, planJson: JSON.stringify(updatedPlanData) })
                });
            } catch (e) { console.error("Sync failed", e); }
        }
    };

    // UI Helpers
    const loadPlan = (plan: any) => {
        setActivePlanId(plan.id); setPlanData(plan.plan_data); renderMapAndCalendar(plan.plan_data);
        setChatMessages([{ id: Date.now().toString(), text: `Loaded "${plan.title}". Your daily focus has been updated.`, sender: 'ai' }]);
    };

    const handleNewPlan = () => {
        setActivePlanId(null); setPlanData(null); setNodes([]); setEdges([]); setCalendarEvents([]); setTodayTasks([]); setSelectedNodeId(null);
        setChatMessages([{ id: Date.now().toString(), text: 'Starting fresh! What is your target university or major?', sender: 'ai' }]);
    };

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id); setSelectedNodeData(node.data.rawData);
    }, []);

    const totalTodayHours = todayTasks.reduce((acc, task) => acc + task.recommendedHours, 0);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
            
            {/* LEFT SIDEBAR (History) */}
            <div style={{ width: isSidebarOpen ? '280px' : '0px', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden', backgroundColor: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '4px 0 20px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #1e293b' }}>
                    <h2 style={{ margin: '0 0 20px 0', fontSize: '1.25em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2em' }}>🎓</span> Admissions AI
                    </h2>
                    <button onClick={handleNewPlan} style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}>
                        + Build New Roadmap
                    </button>
                </div>
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px' }}>
                    <p style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Your Master Plans</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {savedPlans.map(plan => (
                            <button key={plan.id} onClick={() => loadPlan(plan)} style={{ textAlign: 'left', padding: '12px 14px', backgroundColor: activePlanId === plan.id ? '#1e293b' : 'transparent', color: activePlanId === plan.id ? '#38bdf8' : '#cbd5e1', border: activePlanId === plan.id ? '1px solid #334155' : '1px solid transparent', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9em', fontWeight: activePlanId === plan.id ? '600' : '400', transition: 'all 0.2s' }}>
                                📄 {plan.title}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* CENTER CANVAS (Mission Control) */}
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                
                {/* Header Navbar */}
                <div style={{ height: '70px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '20px', zIndex: 20 }}>
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', fontSize: '1.4em', cursor: 'pointer', color: '#64748b' }}>☰</button>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15em', fontWeight: '700', flexGrow: 1 }}>{planData ? planData.plan_title : 'Mission Control'}</h3>
                    
                    {planData && (
                        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '4px' }}>
                            <button onClick={() => setActiveTab('today')} style={{ background: activeTab === 'today' ? '#ffffff' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9em', fontWeight: activeTab === 'today' ? '700' : '500', color: activeTab === 'today' ? '#0f172a' : '#64748b', cursor: 'pointer', boxShadow: activeTab === 'today' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>🎯 Today</button>
                            <button onClick={() => setActiveTab('tree')} style={{ background: activeTab === 'tree' ? '#ffffff' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9em', fontWeight: activeTab === 'tree' ? '700' : '500', color: activeTab === 'tree' ? '#0f172a' : '#64748b', cursor: 'pointer', boxShadow: activeTab === 'tree' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>🗺️ Roadmap</button>
                            <button onClick={() => setActiveTab('calendar')} style={{ background: activeTab === 'calendar' ? '#ffffff' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9em', fontWeight: activeTab === 'calendar' ? '700' : '500', color: activeTab === 'calendar' ? '#0f172a' : '#64748b', cursor: 'pointer', boxShadow: activeTab === 'calendar' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>📅 Schedule</button>
                        </div>
                    )}
                    <button onClick={onClose} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '8px 16px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}>Exit</button>
                </div>

                <div style={{ flexGrow: 1, position: 'relative', overflowY: 'auto' }}>
                    {!planData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', textAlign: 'center', padding: '20px' }}>
                            <div style={{ fontSize: '4em', marginBottom: '20px' }}>✨</div>
                            <h2 style={{ color: '#0f172a', marginBottom: '12px', fontSize: '2em', fontWeight: '800' }}>Your Journey Starts Here.</h2>
                            <p style={{ maxWidth: '450px', lineHeight: '1.6', fontSize: '1.1em' }}>Use the AI Assistant on the right to describe your dream university. I will instantly build a personalized roadmap and daily task tracker.</p>
                        </div>
                    ) : (
                        <>
                            {/* ✨ THE NEW "TODAY'S FOCUS" TAB ✨ */}
                            {activeTab === 'today' && (
                                <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
                                    <div style={{ marginBottom: '40px' }}>
                                        <h1 style={{ fontSize: '2.5em', fontWeight: '800', color: '#0f172a', margin: '0 0 10px 0' }}>Good Morning.</h1>
                                        <p style={{ fontSize: '1.1em', color: '#64748b', margin: 0 }}>Here is your admissions focus for today. You have <strong style={{color: '#3b82f6'}}>{totalTodayHours} hours</strong> of recommended study time.</p>
                                    </div>

                                    {todayTasks.length === 0 ? (
                                        <div style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '20px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                            <div style={{ fontSize: '3em', marginBottom: '15px' }}>🎉</div>
                                            <h3 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>You are all caught up!</h3>
                                            <p style={{ color: '#64748b', margin: 0 }}>No active tasks scheduled for today. Enjoy your break or check the Roadmap to jump ahead.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {todayTasks.map((task, idx) => (
                                                <div key={idx} style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', backgroundColor: '#3b82f6' }}></div>
                                                    
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <span style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{task.parentTitle}</span>
                                                            <h3 style={{ margin: '8px 0 0 0', color: '#0f172a', fontSize: '1.3em' }}>{task.taskTitle}</h3>
                                                        </div>
                                                        <div style={{ backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', color: '#475569', fontSize: '0.85em', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            ⏱️ {task.recommendedHours} hrs recommended
                                                        </div>
                                                    </div>
                                                    
                                                    <button onClick={() => toggleNodeCompletion(task.nodeId)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', color: '#059669', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                        <span style={{ width: '20px', height: '20px', borderRadius: '6px', backgroundColor: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span> Mark Phase Complete
                                                    </button>

                                                    {task.resources && task.resources.length > 0 && (
                                                        <div style={{ marginTop: '10px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                                                            <p style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 'bold', margin: '0 0 10px 0' }}>RECOMMENDED RESOURCES:</p>
                                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                {task.resources.map((rec: any, i: number) => (
                                                                    <a key={i} href={rec.url} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px', textDecoration: 'none', color: '#0f172a', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
                                                                        🔗 {rec.name} <span style={{ color: '#10b981' }}>({rec.estimated_price})</span>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'tree' && (
                                <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView attributionPosition="bottom-left">
                                    <Background color="#cbd5e1" gap={24} size={2} />
                                    <Controls style={{ boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', borderRadius: '8px', overflow: 'hidden', border: 'none' }} />
                                </ReactFlow>
                            )}
                            
                            {activeTab === 'calendar' && (
                                <div style={{ padding: '24px', height: '100%', backgroundColor: '#ffffff' }}>
                                    <Calendar localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" views={['month', 'week', 'agenda']} style={{ height: '100%', color: '#0f172a', fontFamily: 'inherit' }} />
                                </div>
                            )}

                            {/* Node Details Overlay (Roadmap View) */}
                            {selectedNodeId && selectedNodeData && activeTab === 'tree' && (
                                <div style={{ position: 'absolute', top: 24, left: 24, width: '360px', backgroundColor: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', zIndex: 5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                        <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1.2em', fontWeight: '800', lineHeight: '1.3' }}>{selectedNodeData.title}</h4>
                                        <button onClick={() => setSelectedNodeId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: '#64748b', fontWeight: 'bold' }}>✕</button>
                                    </div>
                                    
                                    <div onClick={() => toggleNodeCompletion(selectedNodeId)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', marginBottom: '24px', backgroundColor: selectedNodeData.status === 'completed' ? '#ecfdf5' : '#f8fafc', border: selectedNodeData.status === 'completed' ? '2px solid #10b981' : '2px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: selectedNodeData.status === 'completed' ? '0 4px 14px 0 rgba(16, 185, 129, 0.39)' : 'none' }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: selectedNodeData.status === 'completed' ? 'none' : '2px solid #94a3b8', backgroundColor: selectedNodeData.status === 'completed' ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                                            {selectedNodeData.status === 'completed' && '✓'}
                                        </div>
                                        <span style={{ fontWeight: '800', fontSize: '1.05em', color: selectedNodeData.status === 'completed' ? '#059669' : '#475569' }}>
                                            {selectedNodeData.status === 'completed' ? 'Phase Completed!' : 'Mark as Complete'}
                                        </span>
                                    </div>

                                    {selectedNodeData.recommendations && selectedNodeData.recommendations.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <p style={{ margin: 0, fontSize: '0.85em', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resources</p>
                                            {selectedNodeData.recommendations.map((rec: any, idx: number) => (
                                                <div key={idx} style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                                    <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.95em', marginBottom: '6px' }}>{rec.name}</strong>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#64748b' }}>
                                                        <span>{rec.type}</span><span style={{ color: '#059669', fontWeight: 'bold' }}>{rec.estimated_price}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* PANE 3: RIGHT PANEL (AI Assistant Chat) */}
            <div style={{ width: '360px', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '-4px 0 20px rgba(0,0,0,0.03)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1em', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)' }}></span>
                        AI Mentor
                    </h3>
                </div>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {chatMessages.map(msg => (
                        <div key={msg.id} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                            <div style={{ backgroundColor: msg.sender === 'user' ? '#0f172a' : '#f8fafc', color: msg.sender === 'user' ? '#ffffff' : '#334155', padding: '14px 18px', borderRadius: msg.sender === 'user' ? '18px 18px 0 18px' : '18px 18px 18px 0', fontSize: '0.95em', border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0', lineHeight: '1.5', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isProcessing && (
                        <div style={{ alignSelf: 'flex-start', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: '18px 18px 18px 0', color: '#64748b', display: 'flex', gap: '6px' }}>
                            <span className="dot-pulse">●</span><span className="dot-pulse" style={{ animationDelay: '0.2s'}}>●</span><span className="dot-pulse" style={{ animationDelay: '0.4s'}}>●</span>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', backgroundColor: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '16px', padding: '6px 8px 6px 16px', transition: 'border-color 0.2s' }}>
                        <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') handleSendPrompt(); }} placeholder={planData ? "Ask to modify schedule..." : "E.g., Prep for TGAT in 3 months"} disabled={isProcessing} style={{ flexGrow: 1, border: 'none', background: 'transparent', outline: 'none', color: '#0f172a', fontSize: '0.95em', fontFamily: 'inherit' }} />
                        <button onClick={handleSendPrompt} disabled={isProcessing || !prompt.trim()} style={{ backgroundColor: prompt.trim() ? '#3b82f6' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: prompt.trim() ? 'pointer' : 'default', transition: 'all 0.2s', fontWeight: 'bold' }}>↑</button>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.75em', color: '#94a3b8', margin: '10px 0 0 0', fontWeight: '500' }}>AI builds the plan. You put in the hours.</p>
                </div>
            </div>

            <style>{`
                @keyframes pulse { 0% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.3; transform: scale(0.8); } }
                .dot-pulse { animation: pulse 1.2s infinite ease-in-out; display: inline-block; font-size: 0.8em; }
                input::placeholder { color: #94a3b8; }
            `}</style>
        </div>
    );
}