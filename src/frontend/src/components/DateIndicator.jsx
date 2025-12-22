import { useMemo } from 'react';
import './DateIndicator.css';

export function DateIndicator({ date }) {
  const dateInfo = useMemo(() => {
    const [year, month, day] = date.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Calculate position (0-100%) of the day within the month
    const dayPosition = ((day - 1) / (daysInMonth - 1)) * 100;

    // Generate 5 months centered around current month
    const months = [];
    for (let i = -2; i <= 2; i++) {
      const targetDate = new Date(year, month - 1 + i, 1);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth() + 1;
      months.push({
        label: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        isActive: i === 0
      });
    }

    return {
      months,
      dayPosition,
      day,
      daysInMonth
    };
  }, [date]);

  return (
    <div className="date-indicator">
      <div className="month-timeline">
        {dateInfo.months.map((month, idx) => (
          <div
            key={idx}
            className={`month-label ${month.isActive ? 'active' : ''}`}
          >
            {month.label}
          </div>
        ))}
      </div>
      <div className="day-track">
        <div className="track-bar"></div>
        <div
          className="day-marker"
          style={{ left: `${dateInfo.dayPosition}%` }}
        >
          <div className="marker-line"></div>
          <div className="marker-label">{dateInfo.day}</div>
        </div>
      </div>
    </div>
  );
}
