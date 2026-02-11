import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import TeacherDashboard from './components/TeacherDashboard';

function App() {
    return (
        <Router>
            <div className="min-h-screen bg-gray-900 text-white">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/teacher" element={<TeacherDashboard />} />
                    <Route path="*" element={<div className="flex h-screen items-center justify-center text-gray-400">404: Page Not Found</div>} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
