// Firebase initialization for Academy Management System
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBh2J5kDrE-G8ybvYTNL09WNJjzxb054E",
  authDomain: "clicktake-academy.firebaseapp.com",
  projectId: "clicktake-academy",
  storageBucket: "clicktake-academy.firebasestorage.app",
  messagingSenderId: "119076413883",
  appId: "1:119076413883:web:68c2b9d63c41394a4b249e",
  measurementId: "G-KR5SJ8BSSW"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
