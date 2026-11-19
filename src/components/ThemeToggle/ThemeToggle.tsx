import { Coffee, Sun, Moon, TreePine, Compass, Palette } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { themeInfo } from '../../services/themes';

export function ThemeToggle() {
  const theme = usePaperStore((s) => s.theme);
  const cycleTheme = usePaperStore((s) => s.cycleTheme);
  const info = themeInfo(theme);

  const icon =
    theme === 'sepia' ? (
      <Coffee size={15} />
    ) : theme === 'light' || theme === 'solarized-light' || theme === 'rose' || theme === 'typewriter' ? (
      <Sun size={15} />
    ) : theme === 'forest' ? (
      <TreePine size={15} />
    ) : theme === 'nord' ? (
      <Compass size={15} />
    ) : theme === 'dark' || theme === 'ink' ? (
      <Moon size={15} />
    ) : (
      <Palette size={15} />
    );

  return (
    <button
      type="button"
      className="toolbar-btn theme-cycle-btn"
      onClick={cycleTheme}
      title={`Theme: ${info.label} (Ctrl+Shift+D to cycle)`}
    >
      {icon}
      <span className="toolbar-btn-label">{info.label}</span>
    </button>
  );
}
