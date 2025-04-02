// src/App.tsx
import './App.css';
import ChatbotPage from './ChatbotPage'; // THE IMPORT (You likely have this)

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Project Theraphy Dashboard</h1>
      </header>
      {/* THE USAGE - Make sure this line below is present */}
      <ChatbotPage /> 
    </div>
  );
}

export default App;