import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Settings,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Terminal,
  Play,
  Compass,
  Sliders
} from 'lucide-react';

const HARDCODED_CONFIG = {
  tbHost: "161.53.133.253",
  tbPort: "8080",
  username: "marko.miskic@fer.hr",
  password: "smartzoo",
  deviceIds: {
    lav: {
      pir: "dc74d7b0-5b8c-11f1-a544-db21b46190ed",
      scale: "dc578bb0-5b8c-11f1-a544-db21b46190ed",
      esp32: "dbc55dd0-5b8c-11f1-a544-db21b46190ed"
    },
    slon: {
      pir: "dd00c400-5b8c-11f1-a544-db21b46190ed",
      scale: "dcd4d200-5b8c-11f1-a544-db21b46190ed",
      esp32: "dca9f170-5b8c-11f1-a544-db21b46190ed"
    },
    zebra: {
      pir: "3e9cbf70-6056-11f1-a544-db21b46190ed",
      scale: "5fa9bf10-6056-11f1-a544-db21b46190ed",
      esp32: "6f90ca90-6056-11f1-a544-db21b46190ed"
    }
  }
};

const getTargetUrl = (path, host, port) => {
  if (host === '161.53.133.253' && port === '8080') {
    return path;
  }
  return `http://${host}:${port}${path}`;
};

const MOCK_STATE = {
  lav: { motion_detected: false, food_level: 15.0, led_status: true, food_weight: 150 },
  slon: { motion_detected: false, food_level: 45.0, led_status: true, food_weight: 450 },
  zebra: { motion_detected: false, food_level: 22.0, led_status: true, food_weight: 220 }
};

const EMPTY_STATE = {
  lav: { motion_detected: null, food_level: '-', led_status: null, food_weight: '-' },
  slon: { motion_detected: null, food_level: '-', led_status: null, food_weight: '-' },
  zebra: { motion_detected: null, food_level: '-', led_status: null, food_weight: '-' }
};

function App() {
  const [darkMode, setDarkMode] = useState(false);

  const [appMode, setAppMode] = useState('live');
  const [role, setRole] = useState(null);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminUser === 'admin' && adminPass === 'admin') {
      setRole('admin');
      setLoginError('');
      setAdminUser('');
      setAdminPass('');
    } else {
      setLoginError('Neispravno korisnicko ime ili lozinka.');
    }
  };

  const handleVisitorLogin = () => {
    setRole('visitor');
    setLoginError('');
  };

  const handleLogout = () => {
    setRole(null);
    setTbToken('');
    setTbConnected(false);
  };

  const [tbHost, setTbHost] = useState(HARDCODED_CONFIG.tbHost);
  const [tbPort, setTbPort] = useState(HARDCODED_CONFIG.tbPort);
  const [tbUsername, setTbUsername] = useState(HARDCODED_CONFIG.username);
  const [tbPassword, setTbPassword] = useState(HARDCODED_CONFIG.password);
  const [tbToken, setTbToken] = useState('');
  const [tbConnected, setTbConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [deviceIds, setDeviceIds] = useState(HARDCODED_CONFIG.deviceIds);

  const [enclosures, setEnclosures] = useState(EMPTY_STATE);

  const [actionLoading, setActionLoading] = useState({
    lav: { feeder: false },
    slon: { feeder: false },
    zebra: { feeder: false }
  });

  const [activeSandboxTab, setActiveSandboxTab] = useState('lav');

  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), type: 'system', text: 'Sustav pokrenut u Sandbox nacinu rada.' },
    { id: 2, time: new Date().toLocaleTimeString(), type: 'system', text: 'Konfiguracije ucitane. Sva 3 sektora imaju po 3 uredjaja (ukupno 9).' }
  ]);

  const addLog = (text, type = 'system') => {
    setLogs(prev => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), type, text },
      ...prev.slice(0, 49)
    ]);
  };

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);

  useEffect(() => {
    if (appMode !== 'sandbox') return;

    const interval = setInterval(() => {
      setEnclosures(prev => {
        const next = { ...prev };

        Object.keys(next).forEach(encId => {
          const state = next[encId];
          const food = Math.max(0, Math.min(100, (state.food_level === '-' ? 50 : state.food_level) - (Math.random() * 0.05)));
          const motion = Math.random() < 0.15;

          next[encId] = {
            ...state,
            food_level: parseFloat(food.toFixed(2)),
            food_weight: Math.round(food * 10),
            motion_detected: motion,
            led_status: food > 10
          };

          if (Math.random() < 0.15) {
            addLog(`[MQTT TX - PIR-${encId}] Telemetrija -> {"motion_detected": ${motion}}`, 'mqtt-tx');
            addLog(`[MQTT TX - ESP32-${encId}] Telemetrija -> {"food_level": ${food.toFixed(1)}%}`, 'mqtt-tx');
          }
        });

        return next;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [appMode]);

  useEffect(() => {
    if (appMode !== 'live' || !tbConnected || !tbToken) return;

    const fetchDeviceData = async (deviceId, encId, profileKey, deviceName) => {
      if (!deviceId) return;
      try {
        let keysQuery = "";
        if (profileKey === 'pir') {
          keysQuery = "?keys=motion_detected";
        } else if (profileKey === 'scale') {
          keysQuery = "?keys=food_weight,food_level";
        } else if (profileKey === 'esp32') {
          keysQuery = "?keys=food_level,led_status";
        }
        const separator = keysQuery ? "&" : "?";
        const url = getTargetUrl(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries${keysQuery}${separator}_=${Date.now()}`, tbHost, tbPort);
        const response = await fetch(url, {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();
        const parsedState = {};

        Object.keys(data).forEach(key => {
          if (data[key] && data[key].length > 0) {
            const rawVal = data[key][0].value;
            if (rawVal !== null && rawVal !== undefined && rawVal !== 'null') {
              if (rawVal === 'true') parsedState[key] = true;
              else if (rawVal === 'false') parsedState[key] = false;
              else {
                const parsedNum = parseFloat(rawVal);
                parsedState[key] = isNaN(parsedNum) ? rawVal : parsedNum;
              }
            }
          }
        });

        if (Object.keys(parsedState).length > 0) {
          setEnclosures(prev => ({
            ...prev,
            [encId]: {
              ...prev[encId],
              ...parsedState
            }
          }));
          addLog(`[HTTP RX - ${deviceName}] Primljeni podaci: ${JSON.stringify(parsedState)}`, 'mqtt-rx');
        } else {
          addLog(`[HTTP RX - ${deviceName}] Uredjaj nema telemetrijskih podataka na ThingsBoardu.`, 'system');
        }
      } catch (err) {
        addLog(`[Live API] Problem s dohvatom za ${deviceName}: ${err.message}`, 'error');
      }
    };

    const pollAllDevices = () => {
      addLog(`[Live API] Pokrecem periodicki dohvat telemetrije za 9 uredjaja...`, 'system');
      Object.keys(deviceIds).forEach(encId => {
        const ids = deviceIds[encId];
        if (ids.pir) {
          fetchDeviceData(ids.pir, encId, 'pir', `PIR-${encId}`);
        }
        if (ids.scale) {
          fetchDeviceData(ids.scale, encId, 'scale', `VirtualScale-${encId}`);
        }
        if (ids.esp32) {
          fetchDeviceData(ids.esp32, encId, 'esp32', `ESP32-${encId}`);
        }
      });
    };

    pollAllDevices();
    const interval = setInterval(pollAllDevices, 8000);

    return () => clearInterval(interval);
  }, [appMode, tbConnected, tbToken, tbHost, tbPort, deviceIds]);

  const handleTriggerFeeder = async (encId) => {
    setActionLoading(prev => ({
      ...prev,
      [encId]: { ...prev[encId], feeder: true }
    }));
    addLog(`[${encId.toUpperCase()}] Zahtjev za aktivacijom hranilice`, 'system');

    if (appMode === 'sandbox') {
      setTimeout(() => {
        setEnclosures(prev => {
          const newFood = Math.min(100.0, (prev[encId].food_level === '-' ? 50 : prev[encId].food_level) + 15.0);
          return {
            ...prev,
            [encId]: { ...prev[encId], food_level: parseFloat(newFood.toFixed(2)) }
          };
        });
        setActionLoading(prev => ({
          ...prev,
          [encId]: { ...prev[encId], feeder: false }
        }));
        addLog(`[ESP32-${encId}] MQTT RX -> RPC request: {"method": "triggerFeeder"}`, 'mqtt-rx');
        addLog(`[ESP32-${encId}] RPC ODGOVOR -> Hranilica aktivirana. Novo stanje: ${Math.min(100, (enclosures[encId].food_level === '-' ? 50 : enclosures[encId].food_level) + 15).toFixed(1)}%.`, 'system');
      }, 1000);
    } else {
      const deviceId = deviceIds[encId].esp32;
      if (!tbConnected || !deviceId) {
        addLog(`[Live GRESKA] Nedostaje veza ili Device ID za ESP32-${encId}.`, 'error');
        setActionLoading(prev => ({ ...prev, [encId]: { ...prev[encId], feeder: false } }));
        return;
      }

      try {
        const url = getTargetUrl(`/api/plugins/rpc/oneway/${deviceId}`, tbHost, tbPort);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          },
          body: JSON.stringify({
            method: "triggerFeeding",
            params: {},
            timeout: 5000
          })
        });

        if (response.ok) {
          addLog(`[Live RPC] Hranilica aktivirana na ThingsBoardu za ${encId}.`, 'system');
          setEnclosures(prev => ({
            ...prev,
            [encId]: { ...prev[encId], food_level: Math.min(100, (prev[encId].food_level === '-' ? 50 : prev[encId].food_level) + 15) }
          }));
        } else {
          throw new Error(`Server status ${response.status}`);
        }
      } catch (err) {
        addLog(`[Live RPC GRESKA] Aktivacija hranilice nije uspjela: ${err.message}`, 'error');
      } finally {
        setActionLoading(prev => ({
          ...prev,
          [encId]: { ...prev[encId], feeder: false }
        }));
      }
    }
  };

  const handleTBConnect = async (e) => {
    e.preventDefault();
    if (!tbUsername || !tbPassword) {
      addLog('[Povezivanje] Upisite korisnicko ime i lozinku.', 'error');
      return;
    }

    setIsLoggingIn(true);
    addLog(`[Live Povezivanje] Prijava na http://${tbHost}:${tbPort}...`, 'system');

    try {
      const response = await fetch(`http://${tbHost}:${tbPort}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: tbUsername,
          password: tbPassword
        })
      });

      if (!response.ok) throw new Error(`Pristup odbijen (${response.status})`);

      const data = await response.json();
      setTbToken(data.token);
      setTbConnected(true);
      addLog('[Povezivanje] Uspjesno povezan na ThingsBoard REST API!', 'system');
    } catch (err) {
      addLog(`[Povezivanje GRESKA] Prijava nije uspjela: ${err.message}`, 'error');
      setTbConnected(false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleTBDisconnect = () => {
    setTbToken('');
    setTbConnected(false);
    addLog('[Povezivanje] Veza s ThingsBoardom prekinuta.', 'system');
  };

  const handleSandboxSliderChange = (encId, field, val) => {
    const numVal = parseFloat(val);
    setEnclosures(prev => ({
      ...prev,
      [encId]: {
        ...prev[encId],
        [field]: numVal
      }
    }));
    addLog(`[Sandbox] ${encId.toUpperCase()} - rucno postavljen ${field} = ${numVal}`, 'system');
  };

  const triggerMotion = (encId) => {
    setEnclosures(prev => ({
      ...prev,
      [encId]: { ...prev[encId], motion_detected: true }
    }));
    addLog(`[Sandbox] ${encId.toUpperCase()} - rucno aktiviran pokret (PIR)`, 'system');
    setTimeout(() => {
      setEnclosures(prev => ({
        ...prev,
        [encId]: { ...prev[encId], motion_detected: false }
      }));
    }, 3000);
  };

  if (!role) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <Compass className="login-logo-icon" />
            <h1 className="login-logo-text">SmartZOO</h1>
            <span className="logo-badge">IoT Portal</span>
          </div>

          {loginError && <div className="login-error">{loginError}</div>}

          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Korisnicko ime</label>
              <input
                type="text"
                className="form-input"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="npr. admin"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Lozinka</label>
              <input
                type="password"
                className="form-input"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', padding: '12px' }}>
              Prijava za Administratore
            </button>
          </form>

          <div className="login-divider">ili</div>

          <button onClick={handleVisitorLogin} className="btn btn-guest">
            Prijava kao Posjetitelj
          </button>
        </div>
      </div>
    );
  }

  if (role === 'visitor') {
    return (
      <div className="flex-col" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="app-header">
          <div className="container header-content">
            <div className="logo-section">
              <Compass className="logo-icon" />
              <h1 className="logo-text">SmartZOO</h1>
              <span className="logo-badge">Posjetitelji</span>
            </div>

            <div className="header-controls">
              <button
                className="btn-icon"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? "Svijetla tema" : "Tamna tema"}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={handleLogout} className="btn btn-outline logout-btn">
                Odjava
              </button>
            </div>
          </div>
        </header>

        <main className="container" style={{ flex: 1 }}>
          <div className="visitor-grid">

            <section className="card enclosure-card lion">
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Lava (Lion Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.lav.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.lav.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.lav.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Preostalo hrane</span>
                  <div className="sensor-value" style={{ color: enclosures.lav.led_status === true ? 'var(--success)' : (enclosures.lav.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.lav.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.lav.food_weight !== undefined && enclosures.lav.food_weight !== null && enclosures.lav.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.lav.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>
            </section>

            <section className="card enclosure-card elephant">
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Slona (Elephant Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.slon.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.slon.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.slon.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Preostalo hrane</span>
                  <div className="sensor-value" style={{ color: enclosures.slon.led_status === true ? 'var(--success)' : (enclosures.slon.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.slon.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.slon.food_weight !== undefined && enclosures.slon.food_weight !== null && enclosures.slon.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.slon.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>
            </section>

            <section className="card enclosure-card zebra" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Zebru (Zebra Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.zebra.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.zebra.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.zebra.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Preostalo hrane</span>
                  <div className="sensor-value" style={{ color: enclosures.zebra.led_status === true ? 'var(--success)' : (enclosures.zebra.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.zebra.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.zebra.food_weight !== undefined && enclosures.zebra.food_weight !== null && enclosures.zebra.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.zebra.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>
            </section>

          </div>
        </main>

        <footer className="app-footer">
          <div className="container">
            <p>© 2026 SmartZOO. Izgradjeno za posjetitelje zooloskog vrta.</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex-col" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      <header className="app-header">
        <div className="container header-content">
          <div className="logo-section">
            <Compass className="logo-icon" />
            <h1 className="logo-text">SmartZOO</h1>
            <span className="logo-badge">Admin</span>
          </div>

          <div className="header-controls">
            <div className="status-indicator">
              {appMode === 'live' && tbConnected ? (
                <>
                  <Wifi size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ color: 'var(--success)' }}>TB Live Spojen</span>
                </>
              ) : (
                <>
                  <WifiOff size={16} style={{ color: 'var(--warning)' }} />
                  <span>Sandbox Način</span>
                </>
              )}
            </div>

            <button
              className="btn-icon"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Svijetla tema" : "Tamna tema"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleLogout} className="btn btn-outline logout-btn">
              Odjava
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ flex: 1 }}>
        <div className="dashboard-grid">

          <div className="enclosures-section">

            <section className="card enclosure-card lion">
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Lava (Lion Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.lav.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost (PIR)</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.lav.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.lav.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Hrana u Hranilici</span>
                  <div className="sensor-value" style={{ color: enclosures.lav.led_status === true ? 'var(--success)' : (enclosures.lav.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.lav.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.lav.food_weight !== undefined && enclosures.lav.food_weight !== null && enclosures.lav.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.lav.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>

              <div className="actuator-control-group">
                <button
                  className="btn btn-primary"
                  onClick={() => handleTriggerFeeder('lav')}
                  disabled={actionLoading.lav.feeder}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {actionLoading.lav.feeder ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} />
                  )}
                  Aktiviraj Hranilicu
                </button>
              </div>
            </section>

            <section className="card enclosure-card elephant">
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Slona (Elephant Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.slon.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost (PIR)</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.slon.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.slon.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Hrana u Hranilici</span>
                  <div className="sensor-value" style={{ color: enclosures.slon.led_status === true ? 'var(--success)' : (enclosures.slon.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.slon.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.slon.food_weight !== undefined && enclosures.slon.food_weight !== null && enclosures.slon.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.slon.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>

              <div className="actuator-control-group">
                <button
                  className="btn btn-primary"
                  onClick={() => handleTriggerFeeder('slon')}
                  disabled={actionLoading.slon.feeder}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {actionLoading.slon.feeder ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} />
                  )}
                  Aktiviraj Hranilicu
                </button>
              </div>
            </section>

            <section className="card enclosure-card zebra" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="card-header">
                <div className="card-title">
                  <div>
                    <h2>Nastamba za Zebru (Zebra Enclosure)</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-grid">
                <div className={`sensor-tile ${enclosures.zebra.motion_detected ? 'active' : ''}`}>
                  <span className="sensor-label">Aktivnost (PIR)</span>
                  <div className="sensor-value" style={{ fontSize: '16px', color: enclosures.zebra.motion_detected ? 'var(--success)' : 'inherit' }}>
                    {enclosures.zebra.motion_detected ? 'Detektiran pokret' : 'Mirno'}
                  </div>
                  <Activity className="sensor-icon" />
                </div>

                <div className="sensor-tile">
                  <span className="sensor-label">Hrana u Hranilici</span>
                  <div className="sensor-value" style={{ color: enclosures.zebra.led_status === true ? 'var(--success)' : (enclosures.zebra.led_status === false ? 'var(--danger)' : 'inherit') }}>
                    {enclosures.zebra.food_level}
                    <span className="sensor-unit">%</span>
                    {enclosures.zebra.food_weight !== undefined && enclosures.zebra.food_weight !== null && enclosures.zebra.food_weight !== '-' && (
                      <span className="sensor-unit" style={{ fontSize: '14px', marginLeft: '6px', opacity: 0.8 }}>
                        ({enclosures.zebra.food_weight} g)
                      </span>
                    )}
                  </div>
                  <Database className="sensor-icon" />
                </div>
              </div>

              <div className="actuator-control-group">
                <button
                  className="btn btn-primary"
                  onClick={() => handleTriggerFeeder('zebra')}
                  disabled={actionLoading.zebra.feeder}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {actionLoading.zebra.feeder ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} />
                  )}
                  Aktiviraj Hranilicu
                </button>
              </div>
            </section>

          </div>

          <div className="sidebar-panel">

            <div className="card">
              <div className="card-header" style={{ marginBottom: '12px', paddingBottom: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Način Rada</h3>
              </div>
              <div className="mode-indicator">
                <div className="mode-badge-container">
                  <button
                    className={`mode-btn ${appMode === 'sandbox' ? 'active' : ''}`}
                    onClick={() => { setAppMode('sandbox'); addLog('Prebaceno na Sandbox simulator.', 'system'); }}
                  >
                    SANDBOX SIMULATOR
                  </button>
                  <button
                    className={`mode-btn ${appMode === 'live' ? 'active' : ''}`}
                    onClick={() => { setAppMode('live'); addLog('Prebaceno na Live ThingsBoard mod.', 'system'); }}
                  >
                    THINGSBOARD LIVE
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {appMode === 'sandbox'
                    ? 'Radite u lokalnoj simulaciji. Nije potrebna veza s ThingsBoardom.'
                    : 'Aplikacija se spaja na ThingsBoard API za slanje naredbi i povlacenje telemetrije.'}
                </p>
              </div>
            </div>

            {appMode === 'live' && (
              <div className="card" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <div className="card-header" style={{ marginBottom: '16px', paddingBottom: '8px', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 5 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Settings size={18} /> Konfiguracija TB Veze
                  </h3>
                </div>

                <form onSubmit={handleTBConnect} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {tbConnected && (
                    <div style={{ fontSize: '13px', padding: '10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} /> Uspješno spojen na REST API!
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Poslužitelj (Host)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={tbHost}
                      onChange={(e) => setTbHost(e.target.value)}
                      disabled={tbConnected}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">REST API Port</label>
                    <input
                      type="text"
                      className="form-input"
                      value={tbPort}
                      onChange={(e) => setTbPort(e.target.value)}
                      disabled={tbConnected}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ThingsBoard Korisnik (Email)</label>
                    <input
                      type="email"
                      className="form-input"
                      value={tbUsername}
                      onChange={(e) => setTbUsername(e.target.value)}
                      disabled={tbConnected}
                      placeholder="tenant@thingsboard.org"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lozinka</label>
                    <input
                      type="password"
                      className="form-input"
                      value={tbPassword}
                      onChange={(e) => setTbPassword(e.target.value)}
                      disabled={tbConnected}
                      placeholder="••••••••"
                      required={!tbConnected}
                    />
                  </div>

                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', paddingTop: '8px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>LAV - Device IDs / Tokens</h4>
                    <div className="form-group" style={{ gap: '6px' }}>
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>PIR ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.lav.pir} onChange={(e) => setDeviceIds(prev => ({ ...prev, lav: { ...prev.lav, pir: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>Vaga ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.lav.scale} onChange={(e) => setDeviceIds(prev => ({ ...prev, lav: { ...prev.lav, scale: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>ESP32 ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.lav.esp32} onChange={(e) => setDeviceIds(prev => ({ ...prev, lav: { ...prev.lav, esp32: e.target.value } }))} disabled={tbConnected} />
                    </div>
                  </div>

                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', marginBottom: '8px' }}>SLON - Device IDs / Tokens</h4>
                    <div className="form-group" style={{ gap: '6px' }}>
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>PIR ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.slon.pir} onChange={(e) => setDeviceIds(prev => ({ ...prev, slon: { ...prev.slon, pir: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>Vaga ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.slon.scale} onChange={(e) => setDeviceIds(prev => ({ ...prev, slon: { ...prev.slon, scale: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>ESP32 ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.slon.esp32} onChange={(e) => setDeviceIds(prev => ({ ...prev, slon: { ...prev.slon, esp32: e.target.value } }))} disabled={tbConnected} />
                    </div>
                  </div>

                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>ZEBRA - Device IDs / Tokens</h4>
                    <div className="form-group" style={{ gap: '6px' }}>
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>PIR ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.zebra.pir} onChange={(e) => setDeviceIds(prev => ({ ...prev, zebra: { ...prev.zebra, pir: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>Vaga ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.zebra.scale} onChange={(e) => setDeviceIds(prev => ({ ...prev, zebra: { ...prev.zebra, scale: e.target.value } }))} disabled={tbConnected} />
                      <label className="form-label" style={{ fontSize: '10px', margin: 0 }}>ESP32 ID</label>
                      <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px' }} value={deviceIds.zebra.esp32} onChange={(e) => setDeviceIds(prev => ({ ...prev, zebra: { ...prev.zebra, esp32: e.target.value } }))} disabled={tbConnected} />
                    </div>
                  </div>

                  {!tbConnected ? (
                    <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={isLoggingIn}>
                      {isLoggingIn ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                      Poveži se i pokreni Live mod
                    </button>
                  ) : (
                    <button type="button" onClick={handleTBDisconnect} className="btn btn-outline" style={{ justifyContent: 'center', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                      Prekini vezu
                    </button>
                  )}
                </form>
              </div>
            )}

            <div className="card">
              <div className="card-header" style={{ marginBottom: '12px', paddingBottom: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={18} /> Konzola i MQTT Poruke
                </h3>
              </div>

              <div className="logs-container">
                {logs.map(log => (
                  <div key={log.id} className={`log-item ${log.type}`}>
                    <span className="log-time">[{log.time}]</span>
                    <span className="log-text">{log.text}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>© 2026 SmartZOO IoT Projekt. Izgrađeno za kolegij Internet Stvari.</p>
          <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>
            Povezano na MQTT ThingsBoard broker: <code>{HARDCODED_CONFIG.tbHost}:45883</code>
          </p>
        </div>
      </footer>

    </div>
  );
}

export default App;
