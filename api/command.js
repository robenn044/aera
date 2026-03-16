// Simple command relay API for remote control
// Stores the latest command in memory (works for single-instance deployments)
// For production, you'd use Redis/Vercel KV

// In-memory store (will reset on cold starts, but fine for presentations)
let currentCommand = {
  action: null,
  timestamp: 0,
  executed: true
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Send a command (from controller/laptop)
  if (req.method === 'POST') {
    const { action, sessionId } = req.body;
    
    if (!action || !['1', '2', '3', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use 1, 2, 3, or stop' });
    }
    
    currentCommand = {
      action,
      timestamp: Date.now(),
      executed: false,
      sessionId: sessionId || 'default'
    };
    
    return res.status(200).json({ 
      success: true, 
      command: currentCommand 
    });
  }

  // GET - Poll for commands (from display/Raspberry Pi)
  if (req.method === 'GET') {
    const { lastTimestamp, sessionId } = req.query;
    const last = parseInt(lastTimestamp) || 0;
    
    // Only return command if it's newer than what client has seen
    if (currentCommand.timestamp > last && !currentCommand.executed) {
      // Mark as executed
      currentCommand.executed = true;
      
      return res.status(200).json({
        hasCommand: true,
        command: currentCommand
      });
    }
    
    return res.status(200).json({ hasCommand: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
