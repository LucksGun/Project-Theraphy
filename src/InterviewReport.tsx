// src/InterviewReport.tsx

import React from 'react';
import type { InterviewReportData } from './InterviewMode'; // Assuming types can be imported
import './InterviewReport.css'; // We will create this CSS file next

interface InterviewReportProps {
    data: InterviewReportData;
    onClose: () => void;
}

// Helper function to count filler words
const countFillerWords = (text: string): Record<string, number> => {
    const fillerWords = ['um', 'uh', 'er', 'ah', 'like', 'okay', 'right', 'so', 'you know'];
    const wordCounts: Record<string, number> = {};
    const words = text.toLowerCase().match(/\b(\w+)\b/g) || [];

    words.forEach(word => {
        if (fillerWords.includes(word)) {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
    });

    return wordCounts;
};


const InterviewReport: React.FC<InterviewReportProps> = ({ data, onClose }) => {
    const { result, summary, transcript } = data;

    const userMessages = transcript.filter(m => m.sender === 'user');
    const totalUserWords = userMessages.reduce((acc, msg) => acc + msg.text.split(' ').length, 0);
    const totalUserTimeSeconds = userMessages.length * 55; // Approximate
    const wordsPerMinute = totalUserWords && totalUserTimeSeconds ? Math.round((totalUserWords / totalUserTimeSeconds) * 60) : 0;

    const allUserText = userMessages.map(m => m.text).join(' ');
    const fillerWordCounts = countFillerWords(allUserText);
    const totalFillerWords = Object.values(fillerWordCounts).reduce((acc, count) => acc + count, 0);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="interview-report-container">
            <div className="report-header">
                <h2>Interview Report</h2>
                <div className={`report-result ${result || 'fail'}`}>
                    Overall Result: <span>{result ? result.toUpperCase() : 'N/A'}</span>
                </div>
            </div>

            <div className="report-section">
                <h3>AI Summary & Feedback</h3>
                <p className="report-summary">{summary || "No summary was generated."}</p>
            </div>

            <div className="report-section">
                <h3>Performance Metrics</h3>
                <div className="metrics-grid">
                    <div className="metric-card">
                        <h4>Pace</h4>
                        <p>{wordsPerMinute} <span>WPM</span></p>
                        <small>(Approximate)</small>
                    </div>
                    <div className="metric-card">
                        <h4>Filler Words</h4>
                        <p>{totalFillerWords}</p>
                        <small>Total "um", "like", etc.</small>
                    </div>
                </div>
                {totalFillerWords > 0 && (
                     <div className="filler-word-details">
                        <strong>Details:</strong>
                        <ul>
                            {Object.entries(fillerWordCounts).map(([word, count]) => (
                                <li key={word}>"{word}": {count} time(s)</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="report-section">
                <h3>Full Transcript</h3>
                <div className="report-transcript">
                    {transcript.map(msg => (
                        <div key={msg.id} className={`transcript-message transcript-${msg.sender}`}>
                            <span className="sender-label">{msg.sender === 'bot' ? 'Interviewer' : 'You'}</span>
                            <p>{msg.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="report-actions">
                <button onClick={handlePrint} className="report-button print">🖨️ Print Report</button>
                <button onClick={onClose} className="report-button close">Close</button>
            </div>
        </div>
    );
};

export default InterviewReport;
