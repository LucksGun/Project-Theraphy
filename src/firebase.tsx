// src/firebase.ts
// This file initializes your Firebase connection.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
 // [REDACTED]
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the auth service for use in other components
export const auth = getAuth(app);
