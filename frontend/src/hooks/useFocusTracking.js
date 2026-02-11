import { useEffect } from 'react';
import axios from 'axios';

const useFocusTracking = (studentId, studentName) => {
    useEffect(() => {
        const updateStatus = async (status) => {
            try {
                await axios.post('http://localhost:5000/api/update-status', {
                    studentId,
                    name: studentName,
                    status
                });
            } catch (error) {
                console.error('Error updating focus status:', error);
            }
        };

        const handleVisibilityChange = () => {
            const status = document.visibilityState === 'visible' ? 'Active' : 'Away';
            updateStatus(status);
        };

        const handleBlur = () => updateStatus('Away');
        const handleFocus = () => updateStatus('Active');

        // Initial status
        updateStatus('Active');

        // Listeners for tab switching / window focus
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
        };
    }, [studentId, studentName]);

    // We need to expose a way to manually update status with more data
    const manualUpdate = async (data) => {
        try {
            await axios.post('http://localhost:5000/api/update-status', {
                studentId,
                name: studentName,
                // If data is string, use as status. If object, merge it.
                ...(typeof data === 'string' ? { status: data } : data)
            });
        } catch (error) {
            console.error('Error updating focus status:', error);
        }
    };

    return { updateStatus: manualUpdate };
};

export default useFocusTracking;
