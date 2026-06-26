import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IDLE_TIMEOUT_OPTIONS } from '../../shared/constants/idleTimeout';
import { Icons } from '../../shared/icons';

const MENU_ESTIMATED_HEIGHT = 168;

export const TimeoutDropdown: React.FC<{
  value: number;
  onChange: (minutes: number) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const [opensUpward, setOpensUpward] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = IDLE_TIMEOUT_OPTIONS.find((o) => o.value === value) ?? IDLE_TIMEOUT_OPTIONS[1];

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_ESTIMATED_HEIGHT + 12;
    setOpensUpward(openUp);

    setMenuStyle(
      openUp
        ? {
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            bottom: window.innerHeight - rect.top + 6,
            zIndex: 10000,
          }
        : {
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            top: rect.bottom + 6,
            zIndex: 10000,
          },
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    return () => window.removeEventListener('resize', updateMenuPosition);
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const menu =
    isOpen && menuStyle
      ? createPortal(
          <ul
            ref={menuRef}
            className={`timeout-dropdown-menu timeout-dropdown-menu--portal${opensUpward ? ' opens-up' : ' opens-down'}`}
            style={menuStyle}
            role="listbox"
            aria-label="Idle timeout"
          >
            {IDLE_TIMEOUT_OPTIONS.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`timeout-dropdown-option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <span className="timeout-dropdown-check" aria-hidden="true">
                        <Icons.Check />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="timeout-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`timeout-dropdown-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Idle timeout: ${selected.label}`}
      >
        <span className="timeout-dropdown-value">{selected.label}</span>
        <span className={`timeout-dropdown-chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
          <Icons.ChevronDown />
        </span>
      </button>
      {menu}
    </div>
  );
};
