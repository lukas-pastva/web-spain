import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import LatestImage from './pages/LatestImage';
import DailyImages from './pages/DailyImages';
import DailyVideos from './pages/DailyVideos';
import DaylightVideos from './pages/DaylightVideos';
import Combined24hVideos from './pages/Combined24hVideos';
import CombinedDaylightVideos from './pages/CombinedDaylightVideos';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/latest" replace />} />
            <Route path="/latest" element={<LatestImage />} />
            <Route path="/daily-images" element={<DailyImages />} />
            <Route path="/daily-videos" element={<DailyVideos />} />
            <Route path="/daylight-videos" element={<DaylightVideos />} />
            <Route path="/combined-24h" element={<Combined24hVideos />} />
            <Route path="/combined-daylight" element={<CombinedDaylightVideos />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
