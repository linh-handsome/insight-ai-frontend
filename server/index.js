const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Dynamic Origin Support
const allowedOrigins = ["http://localhost:3000"];
if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL);
}

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? allowedOrigins : "*",
        methods: ["GET", "POST"]
    }
});

// Centralized State
// Structure: { [socketId]: { id, name, engagement, violations: [], lastUpdate: timestamp } }
let classSessionData = {};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // If it's a student, initialize them
    // We wait for the first update to actually add them effectively, 
    // or we can add them now. Let's wait for 'student_update' to identify them.

    // 1. Listen for updates from Student App
    socket.on('student_update', (data) => {
        // data expected: { name, engagement, violations: [] }
        // Violations from frontend might be cumulative or new. 
        // The Request says: "containing current score and any new violations".
        // However, syncing state is easier if we send the full state or delta.
        // Let's assume the frontend sends the *latest* state of the student.

        const { name, engagement, violations } = data;

        classSessionData[socket.id] = {
            id: socket.id,
            name: name || `Student ${socket.id.substr(0, 4)}`,
            engagement: engagement || 0,
            violations: violations || [], // Array of { time, type }
            lastUpdate: Date.now()
        };

        // 2. Emit updates to Teacher Dashboard
        // Broadcast to everyone (or specifically to a 'teacher' room if we had auth)
        io.emit('teacher_update', classSessionData);
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
        // Optional: Remove student from list or mark as offline
        delete classSessionData[socket.id];
        io.emit('teacher_update', classSessionData);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
