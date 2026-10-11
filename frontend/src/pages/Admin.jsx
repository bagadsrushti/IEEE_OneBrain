import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { getBackendUrl } from '../config';
import { Trophy, Download, Play, Square, RotateCcw, Plus, Users, Clock, CheckCircle } from 'lucide-react';

const Admin = () => {
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState([]);
  const [msg, setMsg] = useState('');
  
  const [settings, setSettings] = useState({ flat120sMode: false, eventTheme: '' });
  const [isLogged, setIsLogged] = useState(false);
  const [usage, setUsage] = useState(null);

  // Event Mode States
  const [eventData, setEventData] = useState(null);
  const [eventTitle, setEventTitle] = useState('Championship Race');
  const [eventCategory, setEventCategory] = useState('Mixed');
  const [maxConcurrentTeams, setMaxConcurrentTeams] = useState(5);
  const [prizeBanner, setPrizeBanner] = useState('Top 3 teams win prizes');

  const backendUrl = getBackendUrl();

  const fetchData = async () => {
    try {
      if (!backendUrl) {
        setMsg('Backend URL is not configured (VITE_SOCKET_URL)');
        return;
      }
      
      const [roomsRes, settingsRes, usageRes, eventRes] = await Promise.all([
        fetch(`${backendUrl}/admin/rooms?password=${password}`),
        fetch(`${backendUrl}/admin/settings?password=${password}`),
        fetch(`${backendUrl}/admin/usage?password=${password}`),
        fetch(`${backendUrl}/admin/event?password=${password}`),
      ]);
      const roomsData = await roomsRes.json();
      const settingsData = await settingsRes.json();
      const usageData = await usageRes.json();
      const evData = await eventRes.json();
      
      if (roomsData.success && settingsData.success) {
        setRooms(roomsData.rooms);
        setSettings({
          flat120sMode: settingsData.flat120sMode,
          eventTheme: settingsData.eventTheme || ''
        });
        if (usageData.success) setUsage(usageData.usage);
        if (evData.success) {
          setEventData(evData);
          if (evData.event) {
            setEventTitle(evData.event.name || 'Championship Race');
            setEventCategory(evData.event.category || 'Mixed');
            setMaxConcurrentTeams(evData.event.maxConcurrentTeams || 5);
            setPrizeBanner(evData.event.prizeBanner || 'Top 3 teams win prizes');
          }
        }
        setIsLogged(true);
        setMsg('');
      } else {
        setMsg('Unauthorized or error fetching data');
      }
    } catch (err) {
      setMsg('Error connecting to server');
    }
  };

  // Event Action Handlers
  const handleCreateEvent = async () => {
    try {
      const res = await fetch(`${backendUrl}/admin/event/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          name: eventTitle,
          category: eventCategory,
          maxConcurrentTeams: parseInt(maxConcurrentTeams, 10),
          prizeBanner,
        })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Event created in Draft mode');
        fetchData();
      } else setMsg(data.error || 'Failed to create event');
    } catch (e) {
      setMsg('Error creating event');
    }
  };

  const handleOpenEvent = async () => {
    if (!window.confirm('Open this event and go LIVE with 3 fair keywords?')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/event/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Event is now LIVE! Teams can join.');
        fetchData();
      } else setMsg(data.error || 'Failed to open event');
    } catch (e) {
      setMsg('Error opening event');
    }
  };

  const handleCloseEvent = async () => {
    if (!window.confirm('Close this event? No new runs will be accepted.')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/event/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Event closed successfully');
        fetchData();
      } else setMsg(data.error || 'Failed to close event');
    } catch (e) {
      setMsg('Error closing event');
    }
  };

  const handleResetEvent = async () => {
    if (!window.confirm('Reset this event and wipe all team runs? This cannot be undone.')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/event/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Event reset successfully');
        fetchData();
      } else setMsg(data.error || 'Failed to reset event');
    } catch (e) {
      setMsg('Error resetting event');
    }
  };

  const handleUpdateCapacity = async () => {
    try {
      const res = await fetch(`${backendUrl}/admin/event/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          maxConcurrentTeams: parseInt(maxConcurrentTeams, 10),
          prizeBanner,
        })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Capacity updated successfully');
        fetchData();
      } else setMsg(data.error || 'Failed to update capacity');
    } catch (e) {
      setMsg('Error updating capacity');
    }
  };

  const handleExportCSV = () => {
    window.open(`${backendUrl}/admin/event/export?password=${encodeURIComponent(password)}`, '_blank');
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
    if (!window.confirm('Are you sure you want to reset the Quick Play leaderboard?')) return;
    try {
      const res = await fetch(`${backendUrl}/admin/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Quick Play leaderboard reset successfully');
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

  const currentEv = eventData?.event;
  const evStatus = currentEv?.status || 'none';

  return (
    <div className="flex-grow p-6 sm:p-8 max-w-4xl mx-auto w-full space-y-8 text-text">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold text-[#1E1B3A]">Admin Panel</h1>
        {isLogged && (
          <Button onClick={fetchData} variant="secondary" className="px-4 py-2 text-sm">
            Refresh Data
          </Button>
        )}
      </div>
      
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
      ) : null}

      {msg && (
        <div className="text-hint p-4 bg-hint-bg rounded-[14px] border border-yellow-200 font-medium">
          {msg}
        </div>
      )}

      {isLogged && (
        <>
          {/* EVENT MODE MANAGEMENT SECTION */}
          <div className="bg-white rounded-[22px] border-2 border-[#5046E5]/20 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F3F4F6] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#5046E5] flex items-center justify-center font-bold">
                  <Trophy size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1E1B3A]">Event Mode Manager</h2>
                  <p className="text-xs text-[#6B7280]">
                    3-round competitive team race with fair keyword pool & capacity control
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#6B7280]">Status:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                  evStatus === 'live' ? 'bg-[#ECFDF5] text-[#10B981] border border-[#A7F3D0]' :
                  evStatus === 'draft' ? 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]' :
                  evStatus === 'closed' ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2]' :
                  'bg-[#F3F4F6] text-[#6B7280]'
                }`}>
                  {evStatus}
                </span>
              </div>
            </div>

            {/* Live Slot Status Indicator */}
            {eventData?.slotUsage && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between text-xs font-semibold text-[#475569]">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[#5046E5]" />
                  <span>{eventData.slotUsage.formatted}</span>
                </div>
                {evStatus === 'live' && (
                  <span className="flex items-center gap-1.5 text-[#10B981] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                    Live Race Active
                  </span>
                )}
              </div>
            )}

            {/* Active 3-Keyword Fair Pool Indicator */}
            {eventData?.pool && eventData.pool.length > 0 && (
              <div className="bg-[#EEF2FF] border border-[#E0E7FF] rounded-xl p-4 space-y-2">
                <span className="text-[11px] font-bold text-[#5046E5] uppercase tracking-wider block">
                  Active 3-Keyword Fair Pool (Server Assigned)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {eventData.pool.map((c, i) => (
                    <div key={i} className="bg-white p-2.5 rounded-lg border border-[#E0E7FF] text-xs">
                      <div className="font-bold text-[#1E1B3A]">Round {i + 1}: {c.answer}</div>
                      <div className="text-[11px] text-[#6B7280]">{c.category} ({c.cluesCount} clues)</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Setup Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  disabled={evStatus === 'live'}
                  className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1">
                  Category
                </label>
                <select
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  disabled={evStatus === 'live'}
                  className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                >
                  <option value="Mixed">Mixed (1 per category)</option>
                  <option value="General Knowledge">General Knowledge</option>
                  <option value="Movies">Movies</option>
                  <option value="Animals">Animals</option>
                  <option value="Trending Topics">Trending Topics</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1 flex justify-between">
                  <span>Max Concurrent Teams</span>
                  <span className="text-[11px] font-normal text-[#9CA3AF]">Range 1–50</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={maxConcurrentTeams}
                    onChange={(e) => setMaxConcurrentTeams(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                  />
                  {evStatus === 'live' && (
                    <Button onClick={handleUpdateCapacity} variant="secondary" className="px-3 text-xs whitespace-nowrap">
                      Update Live
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1">
                  Prize Banner
                </label>
                <input
                  type="text"
                  value={prizeBanner}
                  onChange={(e) => setPrizeBanner(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Event Buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#F3F4F6]">
              {evStatus === 'none' || evStatus === 'closed' ? (
                <button
                  type="button"
                  onClick={handleCreateEvent}
                  className="py-2.5 px-4 bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus size={15} />
                  <span>Create Event Draft</span>
                </button>
              ) : null}

              {evStatus === 'draft' ? (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEvent}
                    className="py-2.5 px-4 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Play size={15} />
                    <span>Open Event (Go Live)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetEvent}
                    className="py-2.5 px-4 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    <span>Reset Draft</span>
                  </button>
                </>
              ) : null}

              {evStatus === 'live' ? (
                <button
                  type="button"
                  onClick={handleCloseEvent}
                  className="py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Square size={15} />
                  <span>Close Event</span>
                </button>
              ) : null}

              {evStatus !== 'none' && (
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="py-2.5 px-4 bg-white border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#1E1B3A] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Download size={15} />
                  <span>Export CSV Results</span>
                </button>
              )}

              {evStatus === 'closed' && (
                <button
                  type="button"
                  onClick={handleResetEvent}
                  className="py-2.5 px-4 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw size={15} />
                  <span>Reset & Wipe Event</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Play Settings & Actions */}
          <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-text">Quick Play Controls</h2>
            <div className="flex flex-wrap gap-4">
              <Button onClick={handleReset} variant="danger" className="text-sm">
                Reset Quick Play Leaderboard
              </Button>
              <Button onClick={handleResetRotation} variant="secondary" className="text-sm">
                Reset Question Rotation
              </Button>
            </div>
          </div>

          {/* Active Rooms Monitor */}
          <div className="bg-surface p-6 rounded-[20px] border border-border shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-text">Active Server Rooms ({rooms.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {rooms.map(r => (
                <div key={r.id} className="p-3 bg-white border border-border rounded-xl text-xs">
                  <div className="font-bold text-[#1E1B3A]">{r.id}</div>
                  <div className="text-[#6B7280]">State: {r.state} · {r.playersCount} players</div>
                </div>
              ))}
              {rooms.length === 0 && (
                <div className="text-xs text-[#9CA3AF]">No active rooms at the moment.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Admin;
