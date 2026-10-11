import type { LucideIcon } from 'lucide-react';
import { CircleDot, Hand, MousePointer2, MoveDown, Spline, Triangle } from 'lucide-react';

export type ToolId = 'select' | 'pan' | 'node' | 'member' | 'support' | 'load';

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: LucideIcon;
  /** Status bar hint while the tool is active. */
  hint: string;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    icon: MousePointer2,
    hint: 'Click to select · Shift-click to add · Drag to move or box-select · Delete removes',
  },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: Hand, hint: 'Drag to pan · Scroll to zoom' },
  { id: 'node', label: 'Add node', shortcut: 'N', icon: CircleDot, hint: 'Click to place a node · Hold Alt to place off-grid' },
  {
    id: 'member',
    label: 'Add member',
    shortcut: 'M',
    icon: Spline,
    hint: 'Click a node or empty space to start a member',
  },
  {
    id: 'support',
    label: 'Add support',
    shortcut: 'S',
    icon: Triangle,
    hint: 'Click a node to add a pin · Click again: roller (y) → roller (x) → none',
  },
  {
    id: 'load',
    label: 'Add load',
    shortcut: 'F',
    icon: MoveDown,
    hint: 'Click a node to add a 10 kN load · Edit it in the properties panel',
  },
];
