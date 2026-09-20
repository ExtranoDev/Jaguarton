// A table on tablets and up (same look as the operator's bookings table); on phones each row
// becomes a stacked card with the column header shown beside each value. It is one set of
// elements restyled with CSS, so there is no duplicated content and nothing to scroll sideways.
//
// columns: [{ key, header, cell(row), mobileLabel? }]. Set mobileLabel to '' to hide the label
// on cards (used for action buttons).
export default function DataTable({ label, columns, rows, getKey }) {
  return (
    <div className="sm:overflow-x-auto sm:rounded-xl sm:border sm:border-border sm:bg-surface">
      <table aria-label={label} className="block w-full border-collapse text-sm sm:table sm:min-w-[680px]">
        <thead className="hidden sm:table-header-group">
          <tr className="bg-sage-tint">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="px-3.5 py-2.5 text-left text-[11px] font-bold uppercase text-ink-2"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => (
            <tr
              key={getKey(row)}
              className="mb-2.5 block rounded-xl border border-border bg-surface p-3.5 sm:mb-0 sm:table-row sm:rounded-none sm:border-0 sm:border-t sm:border-border sm:bg-transparent sm:p-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.mobileLabel ?? column.header}
                  className="flex items-start justify-between gap-4 py-1 text-right before:flex-shrink-0 before:text-left before:text-[11px] before:font-bold before:uppercase before:text-ink-2 before:content-[attr(data-label)] sm:table-cell sm:px-3.5 sm:py-3 sm:text-left sm:before:content-none"
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
