import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeSwitcher from '../renderer/components/ThemeSwitcher';

describe('ThemeSwitcher', () => {
  it('renders with current theme selected', () => {
    render(
      <ThemeSwitcher
        currentTheme="dracula"
        onThemeChange={vi.fn()}
        fontSize={14}
        onFontSizeChange={vi.fn()}
      />,
    );

    // Theme label is present
    expect(screen.getByText(/Theme/)).toBeInTheDocument();

    // Should have theme buttons
    expect(screen.getByText('Tokyo Night')).toBeInTheDocument();
    expect(screen.getByText('Dracula')).toBeInTheDocument();
    expect(screen.getByText('One Dark')).toBeInTheDocument();

    // Dracula should be active
    const draculaBtn = screen.getByText('Dracula');
    expect(draculaBtn.classList.contains('active')).toBe(true);

    const tokyoBtn = screen.getByText('Tokyo Night');
    expect(tokyoBtn.classList.contains('active')).toBe(false);
  });

  it('calls onThemeChange when a theme is clicked', () => {
    const onThemeChange = vi.fn();
    render(
      <ThemeSwitcher
        currentTheme="tokyo-night"
        onThemeChange={onThemeChange}
        fontSize={14}
        onFontSizeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Dracula'));
    expect(onThemeChange).toHaveBeenCalledWith('dracula');
  });

  it('displays current font size', () => {
    render(
      <ThemeSwitcher
        currentTheme="tokyo-night"
        onThemeChange={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Font Size: 16px')).toBeInTheDocument();
  });

  it('renders a font size slider with current value', () => {
    render(
      <ThemeSwitcher
        currentTheme="tokyo-night"
        onThemeChange={vi.fn()}
        fontSize={15}
        onFontSizeChange={vi.fn()}
      />,
    );

    const slider = screen.getByLabelText('Font size') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.type).toBe('range');
    expect(slider.value).toBe('15');
    expect(slider.min).toBe('10');
    expect(slider.max).toBe('24');
  });

  it('calls onFontSizeChange when the slider is moved', () => {
    const onFontSizeChange = vi.fn();
    render(
      <ThemeSwitcher
        currentTheme="tokyo-night"
        onThemeChange={vi.fn()}
        fontSize={14}
        onFontSizeChange={onFontSizeChange}
      />,
    );

    const slider = screen.getByLabelText('Font size') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '18' } });
    expect(onFontSizeChange).toHaveBeenCalledWith(18);
  });
});
