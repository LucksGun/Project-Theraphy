// src/PresentationPage.tsx
import React, { useState, ChangeEvent } from 'react'; // Ensure React is imported
import './PresentationPage.css'; // Make sure you have this CSS file or remove/adjust styling

// --- !!! SECURITY WARNING !!! ---
// Hardcoding the password here is insecure. Anyone can find it by viewing
// the website's source code. This is ONLY suitable for a controlled
// environment like a direct school presentation where you control the machine.
// Do NOT use this method for anything sensitive or public.
const CORRECT_PASSWORD = 'YourSecretPassword123'; // <<< --- CHANGE THIS PASSWORD!

const PresentationPage: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [enteredPassword, setEnteredPassword] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setEnteredPassword(event.target.value);
        setError(null); // Clear error when user types
    };

    // *** FIX 2: Corrected event type here ***
    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); // Prevent page reload
        if (enteredPassword === CORRECT_PASSWORD) {
            setIsAuthenticated(true);
            setError(null);
            // Optional: Clear password from state after successful login
            // setEnteredPassword('');
        } else {
            setError('Incorrect password. Please try again.');
            setIsAuthenticated(false); // Ensure stays false on incorrect attempt
        }
    };

    // *** FIX 1: Corrected condition here (!isAuthenticated) ***
    // Render the password prompt if NOT authenticated
    if (!isAuthenticated) {
        return (
            <div className="presentation-password-container">
                <div className="presentation-password-box">
                    <h2>Enter Presentation Password</h2>
                    {/* Make sure the form element correctly uses the handler */}
                    <form onSubmit={handlePasswordSubmit}>
                        <div className="form-group">
                            <label htmlFor="presentation-password">Password:</label>
                            <input
                                type="password"
                                id="presentation-password"
                                value={enteredPassword}
                                onChange={handlePasswordChange}
                                required
                                autoFocus // Automatically focus the input field
                            />
                        </div>
                        {/* Display error message if it exists */}
                        {error && <p className="password-error">{error}</p>}
                        <button type="submit" className="submit-password-button">
                            Enter
                        </button>
                    </form>
                     <p className="password-note">This area is restricted.</p>
                </div>
            </div>
        );
    }

    // Render the presentation area if authenticated
    // This part only runs if the 'if (!isAuthenticated)' block above is false
    return (
        <div className="presentation-content-area">
            <h1>Presentation Slides</h1>
            <p>Welcome to the presentation area!</p>

            {/* --- !!! WHERE TO PUT YOUR PRESENTATION !!! --- */}
            {/* Option 1: Embed using an iframe (e.g., Google Slides, Canva) */}
            {/* Replace 'YOUR_EMBED_URL' with the actual embed link */}
            {/*
            <iframe
                src="YOUR_EMBED_URL"
                frameBorder="0"
                width="960" // Adjust size as needed
                height="569" // Adjust size as needed
                allowFullScreen={true}
                style={{ border: '1px solid #ccc', display: 'block', margin: '20px auto' }} // Basic styling
                title="Presentation Slides Embed"
            ></iframe>
            */}

            {/* Option 2: Build slides directly here with HTML/CSS or a library */}
            {/* Example placeholder: */}
            <div style={{ border: '2px dashed blue', padding: '20px', margin: '20px', minHeight: '400px', textAlign: 'center' }}>
                <h2>Slide Content Goes Here</h2>
                <p>(Replace this section with your actual presentation content or iframe)</p>
                {/* You could add components for each slide, navigation buttons, etc. */}
            </div>

            {/* Option 3: Link to a separate file (less common for SPAs) */}
            {/* <a href="/path/to/your/presentation.pdf" target="_blank">Open Presentation PDF</a> */}

        </div>
    );
};

export default PresentationPage;