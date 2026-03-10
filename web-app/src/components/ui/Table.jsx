import { useState } from 'react';
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
    const sortedData = [...data].sort((a, b) => {
        if (!sortConfig.key) return 0;

        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

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
        <div className={`w-full overflow-hidden ${className}`}>
            <div className="w-full overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    {/* Header */}
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={`
                    ${column.sortable !== false && sortable ? 'cursor-pointer hover:bg-primary-700/30 select-none' : ''}
                    ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}
                    ${column.width ? `w-[${column.width}]` : ''}
                  `}
                                    onClick={() => column.sortable !== false && handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-1">
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
                                        <td key={col.key}>
                                            <div className="h-4 bg-primary-700/50 rounded animate-pulse" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : sortedData.length === 0 ? (
                            // Empty state
                            <tr>
                                <td colSpan={columns.length} className="text-center py-8 text-primary-500">
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
                                            className={column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}
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
                <div className="flex items-center justify-between px-4 py-3 border-t border-primary-700/50">
                    <p className="text-sm text-primary-400">
                        Showing {pagination.from} to {pagination.to} of {pagination.total} results
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={pagination.onPrevious}
                            disabled={!pagination.hasPrevious}
                            className="p-1 rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm text-primary-300">
                            Page {pagination.currentPage} of {pagination.totalPages}
                        </span>
                        <button
                            onClick={pagination.onNext}
                            disabled={!pagination.hasNext}
                            className="p-1 rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
