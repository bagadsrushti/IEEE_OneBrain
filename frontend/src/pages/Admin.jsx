import React, { useState, useEffect } from 'react';

const Admin = () => {
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState([]);
  const [msg, setMsg] = useState('');
  
  const [settings, setSettings] = useState({ flat120sMode: false, eventTheme: '' });
  const [isLogged, setIsLogged] = useState(false);

  const [usage, setUsage] = useState(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : window.location.origin);

  const fetchData = async () => {
    try {
      const [roomsRes, settingsRes, usageRes] = await Promise.all([
        fetch(`${backendUrl}/admin/rooms?password=${password}`),
        fetch(`${backendUrl}/admin/settings?password=${password}`),
        fetch(`${backendUrl}/admin/usage?password=${password}`)
      ]);
      const roomsData = await roomsRes.json();
      const settingsData = await settingsRes.json();
      const usageData = await usageRes.json();
      
      if (roomsData.success && settingsData.success) {
        setRooms(roomsData.rooms);
        setSettings({
          flat120sMode: settingsData.flat120sMode,
          eventTheme: settingsData.eventTheme || ''
        });
        if (usageData.success) setUsage(usageData.usage);
        setIsLogged(true);
        setMsg('');
      } else {
        setMsg('Unauthorized or error fetching data');
      }
    } catch (err) {
      setMsg('Error connecting to server');
    }
  };

  const updateSettings = async (updates) => {
    try {
      const res = await fetch(`${backendUrl}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...updates })
      });
      const data = await res.json();
      if (data.success) {
        setSettings(s => ({ ...s, ...updates }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset the leaderboard?')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Leaderboard reset successfully');
      } else {
        setMsg(data.message);
      }
    } catch (err) {
      setMsg('Error resetting leaderboard');
    }
  };

  const handleResetRotation = async () => {
    if (!window.confirm('Are you sure you want to reset event rotation (lastUsedAt and played counts)?')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/usage/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Rotation reset successfully');
        fetchData();
      } else setMsg(data.message);
    } catch (err) {
      setMsg('Error resetting rotation');
    }
  };

  const toggleUsage = async (type, id, disabled, domain, subfield) => {
    try {
      await fetch(`${backendUrl}/admin/usage/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, type, id, disabled, domain, subfield })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const categories = [
    'Bollywood Films', 'Hollywood Films', 'Characters', 'Famous People',
    'Cricket & Sports', 'Memes & Internet Culture', 'Tech & Startups', 'VIT Pune & Pune Local'
  ];

  return (
    <div className="flex-grow p-8 max-w-4xl mx-auto w-full space-y-8">
      <h1 className="text-3xl font-bold text-red-400">Admin Panel</h1>
      
      {!isLogged ? (
        <div className="glass-panel p-6 rounded-2xl flex space-x-4">
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex-grow"
          />
          <button onClick={fetchData} className="bg-blue-600 px-6 rounded-lg font-bold hover:bg-blue-700">Login</button>
        </div>
      ) : (
        <button onClick={fetchData} className="bg-gray-800 px-4 py-2 rounded-lg text-sm">Refresh Data</button>
      )}

      {msg && <div className="text-yellow-400 p-4 bg-yellow-900/20 rounded-lg border border-yellow-900">{msg}</div>}

      {isLogged && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <h2 className="text-xl font-bold border-b border-gray-700 pb-2">Global Settings</h2>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">Flat 120s Mode</div>
                  <div className="text-sm text-gray-400">All games get exactly 120 seconds</div>
                </div>
                <button 
                  onClick={() => updateSettings({ flat120sMode: !settings.flat120sMode })}
                  className={`px-4 py-2 rounded-lg font-bold ${settings.flat120sMode ? 'bg-green-600' : 'bg-gray-700'}`}
                >
                  {settings.flat120sMode ? 'ON' : 'OFF'}
                </button>
              </div>

              <div>
                <div className="font-bold mb-2">Event Theme override</div>
                <div className="text-sm text-gray-400 mb-2">Forces all lobbies into this category</div>
                <select 
                  value={settings.eventTheme}
                  onChange={(e) => updateSettings({ eventTheme: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3"
                >
                  <option value="">(None - Mixed)</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <h2 className="text-xl font-bold">Active Rooms ({rooms.length})</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="pb-2">Room ID</th>
                      <th className="pb-2">Players</th>
                      <th className="pb-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.id} className="border-t border-gray-800">
                        <td className="py-2 font-mono">{r.id}</td>
                        <td className="py-2">{r.playersCount}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${r.state === 'playing' ? 'bg-green-900 text-green-300' : 'bg-gray-800'}`}>
                            {r.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rooms.length === 0 && (
                      <tr>
                        <td colSpan="3" className="py-4 text-center text-gray-500">No active rooms</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {usage && (
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h2 className="text-xl font-bold border-b border-gray-700 pb-2">Usage & Toggles</h2>
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="pb-2">Subfield</th>
                      <th className="pb-2">Last Used</th>
                      <th className="pb-2">Toggle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(usage.subfields || {}).map(sf => {
                      const isDisabled = !!(usage.disabled && usage.disabled.subfields[sf]);
                      return (
                        <tr key={sf} className="border-t border-gray-800">
                          <td className="py-2 font-mono">{sf}</td>
                          <td className="py-2">{new Date(usage.subfields[sf]).toLocaleString()}</td>
                          <td className="py-2">
                            <button 
                              onClick={() => toggleUsage('subfield', null, !isDisabled, sf.split('::')[0], sf.split('::')[1])}
                              className={`px-3 py-1 rounded text-xs font-bold ${isDisabled ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}
                            >
                              {isDisabled ? 'Disabled' : 'Enabled'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="glass-panel p-6 rounded-2xl border-red-900 border-2">
            <h2 className="text-xl font-bold text-red-400 mb-4">Danger Zone</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <button onClick={handleReset} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg w-full md:w-auto">
                Reset Leaderboard
              </button>
              <button onClick={handleResetRotation} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg w-full md:w-auto">
                Reset Rotation & Usage History
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Admin;
