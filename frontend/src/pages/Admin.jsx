import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { getBackendUrl } from '../config';

const Admin = () => {
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState([]);
  const [msg, setMsg] = useState('');
  
  const [settings, setSettings] = useState({ flat120sMode: false, eventTheme: '' });
  const [isLogged, setIsLogged] = useState(false);

  const [usage, setUsage] = useState(null);

  const backendUrl = getBackendUrl();

  const fetchData = async () => {
    try {
      if (!backendUrl) {
        setMsg('Backend URL is not configured (VITE_SOCKET_URL)');
        return;
      }
      
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
    if (!window.confirm('Are you sure you want to reset event rotation?')) return;
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
      <h1 className="text-3xl font-bold text-text">Admin Panel</h1>
      
      {!isLogged ? (
        <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-surface border border-border rounded-[14px] p-3 flex-grow focus:outline-none focus:border-primary text-[16px] text-text"
          />
          <Button onClick={fetchData} variant="primary" className="px-8">Login</Button>
        </div>
      ) : (
        <Button onClick={fetchData} variant="secondary" className="px-4 py-2 text-sm">Refresh Data</Button>
      )}

      {msg && <div className="text-hint p-4 bg-hint-bg rounded-[14px] border border-yellow-200 font-medium">{msg}</div>}

      {isLogged && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm space-y-6">
              <h2 className="text-xl font-bold border-b border-border pb-2 text-text">Global Settings</h2>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-text">Flat 120s Mode</div>
                  <div className="text-sm text-text-muted">All games get exactly 120 seconds</div>
                </div>
                <Button 
                  onClick={() => updateSettings({ flat120sMode: !settings.flat120sMode })}
                  variant={settings.flat120sMode ? 'primary' : 'secondary'}
                  className="px-4 py-2"
                >
                  {settings.flat120sMode ? 'ON' : 'OFF'}
                </Button>
              </div>

              <div>
                <div className="font-bold mb-2 text-text">Event Theme override</div>
                <div className="text-sm text-text-muted mb-2">Forces all lobbies into this category</div>
                <select 
                  value={settings.eventTheme}
                  onChange={(e) => updateSettings({ eventTheme: e.target.value })}
                  className="w-full bg-surface border border-border rounded-[14px] p-3 focus:outline-none text-text text-[16px]"
                >
                  <option value="">(None - Mixed)</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <h2 className="text-xl font-bold text-text">Active Rooms ({rooms.length})</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-text-muted">
                      <th className="pb-2">Room ID</th>
                      <th className="pb-2">Players</th>
                      <th className="pb-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-3 font-mono font-medium text-text">{r.id}</td>
                        <td className="py-3 text-text">{r.playersCount}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${r.state === 'playing' ? 'bg-success-bg text-success' : 'bg-border text-text-muted'}`}>
                            {r.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rooms.length === 0 && (
                      <tr>
                        <td colSpan="3" className="py-6 text-center text-text-muted">No active rooms</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {usage && (
            <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm space-y-4">
              <h2 className="text-xl font-bold border-b border-border pb-2 text-text">Usage & Toggles</h2>
              <div className="overflow-y-auto max-h-96 custom-scrollbar">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-text-muted">
                      <th className="pb-2 sticky top-0 bg-surface">Subfield</th>
                      <th className="pb-2 sticky top-0 bg-surface">Last Used</th>
                      <th className="pb-2 sticky top-0 bg-surface">Toggle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(usage.subfields || {}).map(sf => {
                      const isDisabled = !!(usage.disabled && usage.disabled.subfields[sf]);
                      return (
                        <tr key={sf} className="border-t border-border">
                          <td className="py-3 font-mono font-medium text-text">{sf}</td>
                          <td className="py-3 text-text-muted">{new Date(usage.subfields[sf]).toLocaleString()}</td>
                          <td className="py-3">
                            <Button 
                              onClick={() => toggleUsage('subfield', null, !isDisabled, sf.split('::')[0], sf.split('::')[1])}
                              variant={isDisabled ? 'danger' : 'ghost'}
                              className={`px-3 py-1 min-h-0 h-8 rounded-lg text-xs font-bold ${!isDisabled && 'bg-success-bg text-success hover:bg-green-200'}`}
                            >
                              {isDisabled ? 'Disabled' : 'Enabled'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-surface p-6 rounded-[20px] border-danger/30 border shadow-sm">
            <h2 className="text-xl font-bold text-danger mb-4">Danger Zone</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <Button onClick={handleReset} variant="danger" className="w-full md:w-auto">
                Reset Leaderboard
              </Button>
              <Button onClick={handleResetRotation} variant="danger" className="w-full md:w-auto">
                Reset Rotation History
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Admin;
