import React, { useState, useEffect } from 'react';
import ColorBends from './ColorBends';
import './LockScreen.css';

const LockScreen = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const timeFormatted = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const getGreeting = () => {
    const hour = time.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="lock-screen-container">
      <div className="background-layer">
        <ColorBends
          colors={["#5544aa", "#8a5cff", "#00ffd1"]}
          rotation={0}
          speed={0.2}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={1}
          parallax={0.5}
          noise={0.1}
          transparent={false}
          autoRotate={0}
        />
      </div>

      <div className="overlay-layer"></div>

      <div className="content-layer">
        <div className="clock-section">
          <h3 className="greeting-display">{getGreeting()}</h3>
          <h1 className="time-display">{timeFormatted}</h1>
          <h2 className="date-display">{dateFormatted}</h2>
        </div>

        <div className="footer-section">
          <div className="dev-note">
            AERA - Created by Roben Hoxha, Erviol Kina, Antea Shehaj, Amanda, Alkida.
          </div>
        </div>
      </div>
    </div>
  );
};

export default LockScreen;
