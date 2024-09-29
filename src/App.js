// app.js
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import MonacoEditor from 'react-monaco-editor';
import axios from 'axios';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

function App() {
    const [code, setCode] = useState('');
    const [messages, setMessages] = useState([]);
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [executionResult, setExecutionResult] = useState('');
    const [lineComments, setLineComments] = useState({});
    const [chatMessage, setChatMessage] = useState('');
    const [username, setUsername] = useState('');
    const [userJoined, setUserJoined] = useState(false);
    const [room, setRoom] = useState('global'); // Rooms for collaboration
    const [cursorPosition, setCursorPosition] = useState(null);
    const [currentTheme, setCurrentTheme] = useState('vs-dark'); // Theme management
    const [versionHistory, setVersionHistory] = useState([]); // Version control
    const [offlineMode, setOfflineMode] = useState(false); // Offline mode
    const [newRoom, setNewRoom] = useState(''); // Input for new room name

    // Effect to handle socket events and cleanup on unmount
    useEffect(() => {
        socket.on('codeUpdate', (newCode) => setCode(newCode));
        socket.on('userConnected', (users) => setConnectedUsers(users));
        socket.on('userDisconnected', (users) => setConnectedUsers(users));
        socket.on('newComment', (comment) => setMessages((prev) => [...prev, comment]));
        socket.on('newLineComment', ({ lineNumber, comment }) => {
            setLineComments((prev) => ({
                ...prev,
                [lineNumber]: [...(prev[lineNumber] || []), comment],
            }));
        });
        socket.on('updateUserCount', (users) => setConnectedUsers(users));
        socket.on('cursorUpdate', (position) => setCursorPosition(position));

        return () => {
            socket.off('codeUpdate');
            socket.off('userConnected');
            socket.off('userDisconnected');
            socket.off('newComment');
            socket.off('newLineComment');
            socket.off('updateUserCount');
            socket.off('cursorUpdate');
        };
    }, []);

    // Fetch AI suggestions
    const fetchAISuggestion = async (code) => {
        const response = await axios.post('http://localhost:5000/ai-suggest', { codeSnippet: code });
        return response.data.suggestion;
    };

    const handleAIRequest = async () => {
        const suggestion = await fetchAISuggestion(code);
        setCode((prevCode) => prevCode + '\n// AI Suggestion:\n' + suggestion);
    };

    // Handle code changes and emit the update
    const handleEditorChange = (newCode) => {
        setCode(newCode);
        socket.emit('codeUpdate', { newCode, room }); // Emit room-specific updates
        setVersionHistory([...versionHistory, newCode]); // Save version for version control
    };

    // Handle cursor position changes
    const handleCursorChange = (position) => {
        socket.emit('cursorUpdate', { position, room });
    };

    // Handle comment submission
    const handleSendComment = () => {
        const comment = `${newComment} (from ${username})`;
        socket.emit('addComment', { comment, room });
        setNewComment('');
    };

    // Handle code execution
    const handleCodeExecution = async () => {
        try {
            const response = await axios.post('http://localhost:5000/execute-code', { codeSnippet: code });
            setExecutionResult(response.data.result);
        } catch (error) {
            setExecutionResult(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    // Handle line-specific comment submission
    const handleSendLineComment = (lineNumber) => {
        const comment = `${newComment} (from ${username})`;
        setLineComments((prev) => ({
            ...prev,
            [lineNumber]: [...(prev[lineNumber] || []), comment],
        }));
        socket.emit('addLineComment', { lineNumber, comment, room });
        setNewComment('');
    };

    // Handle chat message submission
    const handleSendMessage = (msg) => {
        socket.emit('chatMessage', { msg, room });
        setChatMessage('');
    };

    // Handle room joining logic
    const handleJoin = () => {
        if (username.trim() === '' || newRoom.trim() === '') return; // Validate inputs
        socket.emit('join', { username, room: newRoom }); // Join a specific room
        setRoom(newRoom); // Set the current room
        setUserJoined(true);
    };

    // Handle syntax theme switching
    const toggleTheme = () => {
        setCurrentTheme(currentTheme === 'vs-dark' ? 'vs-light' : 'vs-dark');
    };

    // Handle version rollback
    const handleRollback = (versionIndex) => {
        const previousVersion = versionHistory[versionIndex];
        setCode(previousVersion);
        socket.emit('codeUpdate', { newCode: previousVersion, room });
    };

    // Handle offline mode
    const handleOfflineMode = () => {
        setOfflineMode(!offlineMode);
        if (!offlineMode) {
            // Sync changes when reconnecting
            socket.emit('codeUpdate', { newCode: code, room });
        }
    };

    return (
        <div style={{ backgroundColor: '#222', color: '#fff', padding: '20px' }}>
            <h1>Collaborative Code Editor</h1>

            {!userJoined ? (
                <div>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                    />
                    <input
                        type="text"
                        value={newRoom}
                        onChange={(e) => setNewRoom(e.target.value)}
                        placeholder="Enter room name"
                    />
                    <button onClick={handleJoin}>Join Room</button>
                </div>
            ) : (
                <div>
                    <h2>Welcome, {username}!</h2>
                    <div id="user-count">Connected Users in {room}: {connectedUsers.length}</div>

                    <MonacoEditor
                        width="800"
                        height="600"
                        language="javascript"
                        theme={currentTheme}
                        value={code}
                        onChange={handleEditorChange}
                        options={{
                            selectOnLineNumbers: true,
                            automaticLayout: true,
                        }}
                        onCursorChange={(e) => handleCursorChange(e.position)}
                    />

                    <div>
                        <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                        />
                        <button onClick={handleSendComment}>Send Comment</button>
                    </div>

                    <div>
                        <h3>Chat Messages</h3>
                        {messages.map((msg, index) => (
                            <div key={index}>{msg}</div>
                        ))}
                    </div>

                    <div>
                        <h3>Execution Result</h3>
                        <pre>{executionResult}</pre>
                        <button onClick={handleCodeExecution}>Execute Code</button>
                    </div>

                    <div>
                        <h3>Line Comments</h3>
                        {Object.entries(lineComments).map(([lineNumber, comments]) => (
                            <div key={lineNumber}>
                                <strong>Line {lineNumber}:</strong>
                                <ul>
                                    {comments.map((comment, index) => (
                                        <li key={index}>{comment}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <div>
                        <button onClick={handleAIRequest}>Get AI Suggestion</button>
                    </div>

                    <div>
                        <h3>Version Control</h3>
                        <button onClick={() => handleRollback(versionHistory.length - 1)}>Rollback to Last Version</button>
                        <div>
                            <h4>Version History:</h4>
                            {versionHistory.map((version, index) => (
                                <div key={index}>
                                    <button onClick={() => handleRollback(index)}>Version {index + 1}</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <button onClick={toggleTheme}>Toggle Theme</button>
                        <button onClick={handleOfflineMode}>{offlineMode ? 'Go Online' : 'Go Offline'}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
