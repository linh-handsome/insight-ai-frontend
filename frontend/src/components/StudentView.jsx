import React, { useState } from 'react';
import useFocusTracking from '../hooks/useFocusTracking';
import { BookOpen, GraduationCap, Clock, CheckCircle } from 'lucide-react';

import StudentCamera from './StudentCamera';

const StudentView = () => {
    // In a real app, these would come from Auth/Context
    const [studentInfo] = useState({
        id: "STUDENT_" + Math.floor(Math.random() * 1000),
        name: "Demo Student"
    });

    // Initialize the focus tracking hook
    const { updateStatus } = useFocusTracking(studentInfo.id, studentInfo.name);

    // Socket Handler
    const handleVisionUpdate = (visionStats) => {
        // Automatically push vision stats to server via the hook's manual update
        updateStatus(visionStats);
    };

    return (
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 p-6">
            <div className="flex-1 space-y-6">
                <header className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Advanced Mathematics</h1>
                        <p className="text-brand-muted italic">Chapter 4: Calculus Foundations</p>
                    </div>
                    <div className="bg-brand-surface border border-brand-accent/20 px-4 py-2 rounded-xl flex items-center gap-2">
                        <GraduationCap className="text-brand-accent" size={20} />
                        <span className="text-sm font-medium">{studentInfo.name}</span>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="glass-panel p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <BookOpen className="text-brand-primary" size={24} />
                        <h2 className="text-xl font-bold">Introduction to Limits</h2>
                    </div>
                    <div className="space-y-4 text-brand-text/80 leading-relaxed">
                        <p>
                            In mathematics, a limit is the value that a function (or sequence) "approaches" as the input (or index) approaches some value.
                            Limits are essential to calculus and mathematical analysis.
                        </p>
                        <div className="bg-brand-bg/50 p-6 rounded-xl border border-brand-accent/10 my-8">
                            <h3 className="font-bold text-brand-primary mb-2">Example Problem:</h3>
                            <p className="font-mono text-sm">f(x) = (x² - 1) / (x - 1). Find the limit as x approaches 1.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar with Camera & Progress */}
            <div className="w-full lg:w-80 space-y-6">
                <StudentCamera onUpdate={handleVisionUpdate} studentId={studentInfo.id} />

                <div className="glass-panel p-6">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                        <Clock className="text-brand-warning" size={18} />
                        Section Progress
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span>Understanding Limits</span>
                            <CheckCircle className="text-brand-success" size={16} />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span>One-Sided Limits</span>
                            <div className="w-12 h-1.5 bg-brand-bg rounded-full overflow-hidden">
                                <div className="w-2/3 h-full bg-brand-primary" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentView;
