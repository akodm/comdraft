import type { ReactNode } from 'react';

export interface AdminTableColumn {
  key: string;
  label: ReactNode;
  // 머리칸과 본문칸에 함께 붙는 클래스 (폭, 정렬 등)
  className?: string;
}

export interface AdminTableRow {
  id: string;
  cells: Record<string, ReactNode>;
}

interface AdminTableProps {
  columns: AdminTableColumn[];
  rows: AdminTableRow[];
  // 행이 없을 때 보여 줄 문구
  empty: ReactNode;
}

/**
 * 어드민 목록 표
 * - 폭이 좁으면 표만 가로로 스크롤
 * - 칸 내용은 column.key 로 row.cells 에서 찾음
 */
const AdminTable = ({ columns, rows, empty }: AdminTableProps) => {
  return (
    <div className="overflow-x-auto border border-line bg-white">
      <table className="w-full border-collapse text-left text-[13px] leading-[1.5]">
        <thead className="bg-panel">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-line px-4 py-2.5 text-[12px] font-medium whitespace-nowrap text-ink-muted ${column.className ?? ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-ink-faint"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line last:border-b-0 hover:bg-surface"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-top text-ink ${column.className ?? ''}`}
                  >
                    {row.cells[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminTable;
