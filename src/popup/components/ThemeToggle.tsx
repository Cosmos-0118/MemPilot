import React from 'react';
import { Icons } from '../../shared/icons';
import { useTheme, type Theme } from '../theme/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const themes: { key: Theme; icon: React.FC; label: string }[] = [
    { key: 'light', icon: Icons.Sun, label: 'Light' },
    { key: 'dark', icon: Icons.Moon, label: 'Dark' },
    { key: 'vampire', icon: Icons.Skull, label: 'Vampire' },
  ];

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme selection">
      {themes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          className={`theme-btn ${theme === key ? 'active' : ''}`}
          onClick={() => setTheme(key)}
          title={label}
          role="radio"
          aria-checked={theme === key}
          aria-label={`${label} theme`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
};
