import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Table Component
 * A styled table with sorting and pagination
 * 
 * @example
 * <Table
 *   columns={[
 *     { key: 'name', label: 'Name', sortable: true },
 *     { key: 'price', label: 'Price', sortable: true },
 *   ]}
 *   data={products}
 *   onRowClick={(row) => console.log(row)}
 * />
 */
const Table = ({
    columns = [],
    data = [],
    onRowClick,
    loading = false,
    emptyMessage = 'No data available',
    sortable = true,
    pagination = null,
    className = '',
}) => {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Handle sorting
    const handleSort = (key) => {
        if (!sortable) return;

        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Sort data
    const sortedData = useMemo(() => [...data].sort((a, b) => {
        if (!sortConfig.key) return 0;

        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    }), [data, sortConfig.direction, sortConfig.key]);

    // Render sort icon
    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) {
            return <div className="w-4 h-4" />;
        }
        return sortConfig.direction === 'asc'
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />;
    };

    return (
        <div className={`w-full overflow-hidden rounded-xl border border-primary-200 bg-white ${className}`}>
            <div className="w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[720px] text-left text-sm">
                    {/* Header */}
                    <thead className="sticky top-0 z-10 bg-primary-50">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={`
                    px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-500
                    ${column.sortable !== false && sortable ? 'cursor-pointer select-none hover:bg-primary-100' : ''}
                    ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}
                  `}
                                    style={column.width ? { width: column.width } : undefined}
                                    onClick={() => column.sortable !== false && handleSort(column.key)}
                                >
                                    <div className={`flex items-center gap-1 ${column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : ''}`}>
                                        <span>{column.label}</span>
                                        {column.sortable !== false && sortable && <SortIcon columnKey={column.key} />}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody>
                        {loading ? (
                            // Loading skeleton
                            [...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    {columns.map((col) => (
                                        <td key={col.key} className="border-t border-primary-100 px-4 py-4">
                                            <div className="h-4 rounded bg-primary-100 animate-pulse" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : sortedData.length === 0 ? (
                            // Empty state
                            <tr>
                                <td colSpan={columns.length} className="border-t border-primary-100 py-8 text-center text-primary-500">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            // Data rows
                            sortedData.map((row, index) => (
                                <tr
                                    key={row.id || index}
                                    onClick={() => onRowClick?.(row)}
                                    className={onRowClick ? 'cursor-pointer' : ''}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className={`border-t border-primary-100 px-4 py-3 align-middle text-primary-700 ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                                        >
                                            {column.render ? column.render(row[column.key], row) : row[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination && (
                <div className="flex flex-col gap-3 border-t border-primary-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-primary-500">
                        Showing {pagination.from} to {pagination.to} of {pagination.total} results
                    </p>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <button
                            onClick={pagination.onPrevious}
                            disabled={!pagination.hasPrevious}
                            className="min-h-10 min-w-10 rounded-lg border border-primary-200 p-2 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm font-semibold text-primary-600">
                            Page {pagination.currentPage} of {pagination.totalPages}
                        </span>
                        <button
                            onClick={pagination.onNext}
                            disabled={!pagination.hasNext}
                            className="min-h-10 min-w-10 rounded-lg border border-primary-200 p-2 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Next page"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Table;
