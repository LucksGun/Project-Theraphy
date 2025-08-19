// src/firebase.ts
// This file initializes your Firebase connection.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhbxpAHqtZ62QSytUKW9ZwcUIOeh76DEc",
  authDomain: "project-theraphy.firebaseapp.com",
  databaseURL: "https://project-theraphy-default-rtdb.firebaseio.com",
  projectId: "project-theraphy",
  storageBucket: "project-theraphy.appspot.com",
  messagingSenderId: "674828852767",
  appId: "1:674828852767:web:5ddcb6accb5c681325bf2a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the auth service for use in other components
export const auth = getAuth(app);
