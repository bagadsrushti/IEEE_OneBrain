import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { getBackendUrl } from '../config';
import { Trophy, Download, Play, Square, RotateCcw, Plus, Users, Clock, CheckCircle, Swords, Check } from 'lucide-react';

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
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(4);
  const [minPlayersPerTeam, setMinPlayersPerTeam] = useState(2);
  const [prizeBanner, setPrizeBanner] = useState('Top 3 teams win prizes');

  // Duel Mode States
  const [duelData, setDuelData] = useState(null);
  const [duelMaxMinutes, setDuelMaxMinutes] = useState(10);
  const [duelPrizeBanner, setDuelPrizeBanner] = useState('🍫 Chocolate for {team}!');

  // Team Builder State
  const [teamBuilderPlayers, setTeamBuilderPlayers] = useState(9);
  const [teamBuilderSuggestions, setTeamBuilderSuggestions] = useState([]);

  const backendUrl = getBackendUrl();

  const fetchTeamBuilder = async (players, min, max) => {
    try {
      const res = await fetch(`${backendUrl}/api/event/teambuilder?players=${players}&min=${min}&max=${max}`);
      const data = await res.json();
      if (data.success) {
        setTeamBuilderSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (backendUrl && teamBuilderPlayers >= 2) {
      fetchTeamBuilder(teamBuilderPlayers, minPlayersPerTeam, maxPlayersPerTeam);
    }
  }, [teamBuilderPlayers, minPlayersPerTeam, maxPlayersPerTeam, backendUrl]);

  const fetchData = async () => {
    try {
      if (!backendUrl) {
        setMsg('Backend URL is not configured (VITE_SOCKET_URL)');
        return;
      }
      
      const [roomsRes, settingsRes, usageRes, eventRes, duelsRes] = await Promise.all([
        fetch(`${backendUrl}/admin/rooms?password=${password}`),
        fetch(`${backendUrl}/admin/settings?password=${password}`),
        fetch(`${backendUrl}/admin/usage?password=${password}`),
        fetch(`${backendUrl}/admin/event?password=${password}`),
        fetch(`${backendUrl}/admin/duels?password=${password}`),
      ]);
      const roomsData = await roomsRes.json();
      const settingsData = await settingsRes.json();
      const usageData = await usageRes.json();
      const evData = await eventRes.json();
      const dData = await duelsRes.json();
      
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
            setMaxPlayersPerTeam(evData.event.maxPlayersPerTeam || 4);
            setMinPlayersPerTeam(evData.event.minPlayersPerTeam || 2);
            setPrizeBanner(evData.event.prizeBanner || 'Top 3 teams win prizes');
          }
        }
        if (dData.success) {
          setDuelData(dData);
          if (dData.settings) {
            setDuelMaxMinutes(dData.settings.maxMinutes || 10);
            setDuelPrizeBanner(dData.settings.prizeBanner || '🍫 Chocolate for {team}!');
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
          maxPlayersPerTeam: parseInt(maxPlayersPerTeam, 10),
          minPlayersPerTeam: parseInt(minPlayersPerTeam, 10),
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

  // Duel Mode Action Handlers
  const handleForceEndDuel = async (code) => {
    if (!window.confirm(`Force end duel ${code}? Will resolve immediately with tie-breakers.`)) return;
    try {
      const res = await fetch(`${backendUrl}/admin/duels/force-end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code })
      });
      const data = await res.json();
      if (data.success) {
        setMsg(`Duel ${code} force-ended.`);
        fetchData();
      } else setMsg(data.message || 'Failed to force end duel');
    } catch (e) {
      setMsg('Error force ending duel');
    }
  };

  const handleCancelDuel = async (code) => {
    if (!window.confirm(`Cancel and delete duel ${code}?`)) return;
    try {
      const res = await fetch(`${backendUrl}/admin/duels/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code })
      });
      const data = await res.json();
      if (data.success) {
        setMsg(`Duel ${code} cancelled.`);
        fetchData();
      } else setMsg(data.error || 'Failed to cancel duel');
    } catch (e) {
      setMsg('Error cancelling duel');
    }
  };

  const handleToggleChocolate = async (code, currentVal) => {
    try {
      const res = await fetch(`${backendUrl}/admin/duels/chocolate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code, awarded: !currentVal })
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDuelSettings = async () => {
    try {
      const res = await fetch(`${backendUrl}/admin/duels/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          maxMinutes: parseInt(duelMaxMinutes, 10),
          prizeBanner: duelPrizeBanner,
        })
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Duel settings updated successfully');
        fetchData();
      } else setMsg(data.message || 'Failed to save duel settings');
    } catch (e) {
      setMsg('Error saving duel settings');
    }
  };

  const handleExportDuelsCSV = () => {
    window.open(`${backendUrl}/admin/duels/export?password=${encodeURIComponent(password)}`, '_blank');
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

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1 flex justify-between">
                  <span>Max Players Per Team</span>
                  <span className="text-[11px] font-normal text-[#9CA3AF]">2–8 (default 4)</span>
                </label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={maxPlayersPerTeam}
                  disabled={evStatus === 'live'}
                  onChange={(e) => setMaxPlayersPerTeam(Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 4)))}
                  className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1 flex justify-between">
                  <span>Min Players Per Team</span>
                  <span className="text-[11px] font-normal text-[#9CA3AF]">2–8 (default 2)</span>
                </label>
                <input
                  type="number"
                  min="2"
                  max={maxPlayersPerTeam}
                  value={minPlayersPerTeam}
                  disabled={evStatus === 'live'}
                  onChange={(e) => setMinPlayersPerTeam(Math.max(2, Math.min(maxPlayersPerTeam, parseInt(e.target.value, 10) || 2)))}
                  className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Category Warnings (if any category lacks eligible keywords) */}
            {eventData?.warnings && eventData.warnings.length > 0 && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-3.5 space-y-1.5 text-xs text-[#92400E]">
                <div className="font-bold flex items-center gap-1.5">
                  <span>⚠️ Category Keyword Availability Warnings:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {eventData.warnings.map((w, idx) => (
                    <li key={idx}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Team Builder Helper */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1E1B3A] block">
                    Team Builder Helper
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    Suggest balanced team configurations for players present
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#64748B]">Players:</span>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={teamBuilderPlayers}
                    onChange={(e) => setTeamBuilderPlayers(parseInt(e.target.value, 10) || 2)}
                    className="w-16 bg-white border border-[#CBD5E1] rounded-lg p-1.5 text-center text-xs font-bold"
                  />
                </div>
              </div>

              {teamBuilderSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {teamBuilderSuggestions.map((s, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#1E1B3A] shadow-2xs"
                    >
                      <span className="font-bold text-[#5046E5]">{s.label}</span>
                      <span className="text-[#64748B] ml-1.5 font-mono">({s.sizes.join('+')})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#94A3B8]">
                  No split found fitting {minPlayersPerTeam}–{maxPlayersPerTeam} players per team.
                </div>
              )}
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

          {/* DUEL MODE MANAGEMENT SECTION */}
          <div className="bg-white rounded-[22px] border-2 border-red-500/20 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F3F4F6] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
                  <Swords size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1E1B3A]">Duel Mode Manager</h2>
                  <p className="text-xs text-[#6B7280]">
                    Head-to-head 2-team races (first to 3 solves) with tie-breakers and prize banners
                  </p>
                </div>
              </div>

              {duelData?.roomUsage && (
                <div className="text-xs font-bold px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-gray-700">
                  Global Rooms: {duelData.roomUsage.active} / {duelData.roomUsage.max}
                </div>
              )}
            </div>

            {/* Duel Settings Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1 flex justify-between">
                  <span>Match Cap (DUEL_MAX_MINUTES)</span>
                  <span className="text-[11px] font-normal text-[#9CA3AF]">3–30 mins (default 10)</span>
                </label>
                <input
                  type="number"
                  min="3"
                  max="30"
                  value={duelMaxMinutes}
                  onChange={(e) => setDuelMaxMinutes(Math.max(3, Math.min(30, parseInt(e.target.value, 10) || 10)))}
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1B3A] mb-1">
                  Default Prize Banner
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={duelPrizeBanner}
                    onChange={(e) => setDuelPrizeBanner(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                  />
                  <Button onClick={handleSaveDuelSettings} variant="secondary" className="px-3 text-xs whitespace-nowrap">
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Duels List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1E1B3A] uppercase tracking-wider">
                  Active Duels ({duelData?.liveDuels?.length || 0})
                </h3>
              </div>

              {(!duelData?.liveDuels || duelData.liveDuels.length === 0) ? (
                <div className="text-xs text-gray-400 p-4 border border-dashed border-gray-200 rounded-xl text-center">
                  No duels currently running.
                </div>
              ) : (
                <div className="space-y-2">
                  {duelData.liveDuels.map(d => (
                    <div key={d.code} className="p-3 bg-white border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-mono font-black text-sm text-gray-900 mr-2">#{d.code}</span>
                        <span className="font-bold text-red-600">{d.teamRedName} ({d.teamRedSolved}/3)</span>
                        <span className="text-gray-400 mx-1.5">vs</span>
                        <span className="font-bold text-blue-600">{d.teamBlueName} ({d.teamBlueSolved}/3)</span>
                        <span className="text-gray-500 ml-2">· {Math.floor(d.elapsedSeconds / 60)}m {d.elapsedSeconds % 60}s elapsed</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleForceEndDuel(d.code)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs transition-colors"
                        >
                          Force End
                        </button>
                        <button
                          onClick={() => handleCancelDuel(d.code)}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Finished Duels with Chocolate Checkbox */}
            <div className="space-y-3 pt-2 border-t border-[#F3F4F6]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1E1B3A] uppercase tracking-wider">
                  Finished Duels & Chocolate Status
                </h3>
                <button
                  onClick={handleExportDuelsCSV}
                  className="py-1.5 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs"
                >
                  <Download size={13} /> Export Duels CSV
                </button>
              </div>

              {(!duelData?.winners || duelData.winners.length === 0) ? (
                <div className="text-xs text-gray-400 p-4 border border-dashed border-gray-200 rounded-xl text-center">
                  No finished duels recorded.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {duelData.winners.map(w => (
                    <div key={w.code} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-gray-800 mr-2">#{w.code}</span>
                        <span className="font-extrabold text-gray-900">Winner: {w.winningTeamName}</span>
                        <span className="text-gray-500 ml-2">({w.totalDurationSeconds}s · {w.winnerReason})</span>
                      </div>
                      <label className="flex items-center gap-1.5 font-bold cursor-pointer text-xs select-none">
                        <input
                          type="checkbox"
                          checked={!!w.chocolateAwarded}
                          onChange={() => handleToggleChocolate(w.code, !!w.chocolateAwarded)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className={w.chocolateAwarded ? 'text-emerald-700' : 'text-gray-500'}>
                          🍫 Chocolate awarded
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
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
