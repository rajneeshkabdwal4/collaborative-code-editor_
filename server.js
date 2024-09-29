// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const axios = require('axios'); // Add axios for API calls

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'; // Replace with the correct Mistral endpoint
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY; // Ensure you have this in your .env file
app.use(bodyParser.json());
const connectedUsers = new Set();

// Endpoint for AI suggestions
app.post('/ai-suggest', async (req, res) => {
    const { codeSnippet } = req.body;

    // Call an AI API to get suggestions
    try {
        // Replace 'YOUR_API_KEY' with your actual OpenAI API key
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: 'text-davinci-002',
            prompt: `Suggest improvements or modifications for the following code snippet:\n${codeSnippet}\n\nSuggestions:`,
            max_tokens: 150,
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer YOUR_API_KEY`,
                'Content-Type': 'application/json',
            },
        });

        const suggestion = response.data.choices[0].text.trim();
        res.json({ suggestion });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get AI suggestion' });
    }
});

// Endpoint for code execution
app.post('/execute-code', (req, res) => {
    const { codeSnippet } = req.body;

    exec(`node -e "${codeSnippet}"`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: stderr });
        }
        res.json({ result: stdout });
    });
});

io.on('connection', (socket) => {
    let username = '';

    // Handle user joining
    socket.on('join', ({ username: name, room }) => {
        username = name;
        socket.join(room);
        connectedUsers.add(username);
        io.in(room).emit('userConnected', Array.from(connectedUsers));
        io.emit('updateUserCount', connectedUsers.size);
    });

    // Handle code updates
    socket.on('codeUpdate', ({ newCode, room }) => {
        socket.to(room).emit('codeUpdate', newCode);
    });

    // Handle new comments
    socket.on('addComment', ({ comment, room }) => {
        io.in(room).emit('newComment', comment);
    });

    // Handle line comments
    socket.on('addLineComment', ({ lineNumber, comment, room }) => {
        io.in(room).emit('newLineComment', { lineNumber, comment });
    });

    // Handle chat messages
    socket.on('chatMessage', ({ msg, room }) => {
        io.in(room).emit('newComment', `${username}: ${msg}`);
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        if (username) {
            connectedUsers.delete(username);
            io.emit('userDisconnected', Array.from(connectedUsers));
            io.emit('updateUserCount', connectedUsers.size);
        }
    });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
