'use client';

// DataTable — glass-styled tabular data with hover state + optional row click.
// Generic over T so consumers get typed rows without `any`.
//
// Intentionally minimal: no built-in sorting, filtering, or pagination yet.
// Adding those mid-build invites scope sprawl; once we have 3-4 consumers
// we'll know which features actually deserve to land.

import { CSSProperties, ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  /** Width hint — number = px, string = CSS dim, undefined = auto */
  width?: number | string;
  /** Right-align numerics */
  align?: 'left' | 'right' | 'center';
  /** Custom cell renderer; defaults to String(row[key]) */
  render?: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Stable id per row for keys + click target */
  getRowId: (row: T, index: number) => string | number;
  /** Optional click handler; cursor becomes pointer when set */
  onRowClick?: (row: T, index: number) => void;
  /** Optional row highlight predicate (e.g. "active session") */
  isRowActive?: (row: T, index: number) => boolean;
  /** Optional empty-state content; defaults to nothing */
  empty?: ReactNode;
  style?: CSSProperties;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  isRowActive,
  empty,
  style,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div
        className="atm-glass"
        style={{ padding: 0, overflow: 'hidden', ...style }}
      >
        <TableHeader columns={columns} />
        {empty}
      </div>
    );
  }

  return (
    <div
      className="atm-glass"
      style={{ padding: 0, overflow: 'hidden', ...style }}
    >
      <TableHeader columns={columns} />
      <div role="rowgroup">
        {rows.map((row, i) => {
          const active = isRowActive?.(row, i) ?? false;
          return (
            <div
              key={getRowId(row, i)}
              role="row"
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: columns.map(c => formatColWidth(c.width)).join(' '),
                gap: 0,
                padding: 0,
                borderTop: '1px solid var(--atm-glass-border)',
                background: active ? 'rgba(var(--accent-r),0.06)' : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={(e) => {
                if (onRowClick) {
                  (e.currentTarget as HTMLDivElement).style.background = active
                    ? 'rgba(var(--accent-r),0.10)'
                    : 'rgba(245, 237, 216, 0.025)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = active
                  ? 'rgba(var(--accent-r),0.06)'
                  : 'transparent';
              }}
            >
              {columns.map(col => (
                <div
                  key={col.key}
                  role="cell"
                  style={{
                    padding: '10px 12px',
                    textAlign: col.align ?? 'left',
                    fontFamily: 'var(--font-inter)',
                    fontSize: 12.5,
                    color: 'var(--t1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableHeader<T>({ columns }: { columns: DataTableColumn<T>[] }) {
  return (
    <div
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: columns.map(c => formatColWidth(c.width)).join(' '),
        background: 'rgba(245, 237, 216, 0.025)',
        borderBottom: '1px solid var(--atm-glass-border)',
      }}
    >
      {columns.map(col => (
        <div
          key={col.key}
          role="columnheader"
          className="atm-micro"
          style={{
            padding: '10px 12px',
            textAlign: col.align ?? 'left',
            marginBottom: 0,
          }}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}

function formatColWidth(width: number | string | undefined): string {
  if (width == null) return 'minmax(0, 1fr)';
  if (typeof width === 'number') return `${width}px`;
  return width;
}
