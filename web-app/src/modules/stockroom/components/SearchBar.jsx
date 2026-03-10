import { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin, Package } from 'lucide-react';
import api from '../api/stockroomApi';

/**
 * SearchBar Component
 * Search for parts by material code or description
 */
const SearchBar = ({ onPartSelect, disabled = false }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef(null);
    const debounceTimer = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced search
    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(async () => {
            try {
                const searchResults = await api.searchParts(query);
                setResults(searchResults);
                setIsOpen(true);
                setSelectedIndex(-1);
            } catch (error) {
                console.error('Search error:', error);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [query]);

    const handleKeyDown = (e) => {
        if (!isOpen || results.length === 0) {
            if (e.key === 'Escape') {
                setQuery('');
                setIsOpen(false);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => prev < results.length - 1 ? prev + 1 : prev);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    handleSelectPart(results[selectedIndex]);
                }
                break;
            case 'Escape':
                setQuery('');
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
            default:
                break;
        }
    };

    const handleSelectPart = (part) => {
        onPartSelect(part);
        setQuery('');
        setIsOpen(false);
        setSelectedIndex(-1);
    };

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setSelectedIndex(-1);
    };

    return (
        <div ref={searchRef} className="relative w-full max-w-lg">
            <div className="relative">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500 pointer-events-none"
                />
                <input
                    type="text"
                    className="input pl-10 pr-10"
                    placeholder="Search by Part Number or scan barcode..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                />
                {query && (
                    <button
                        onClick={clearSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-primary-700 text-primary-500 hover:text-primary-300 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 glass rounded-lg shadow-xl max-h-[400px] overflow-y-auto z-50">
                    {isLoading ? (
                        <div className="p-4 text-center text-primary-500">
                            <div className="spinner mx-auto mb-2" />
                            Searching...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="p-4 text-center text-primary-500">
                            No parts found for "{query}"
                        </div>
                    ) : (
                        results.map((part, index) => (
                            <div
                                key={part.id}
                                onClick={() => handleSelectPart(part)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={`p-3 cursor-pointer border-b border-primary-700/50 last:border-b-0 transition-colors ${selectedIndex === index ? 'bg-primary-700' : 'hover:bg-primary-800'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-primary to-red-700 flex items-center justify-center shrink-0">
                                        <Package className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {/* Material Code */}
                                        <div className="text-accent-warning font-bold font-mono text-base">
                                            {part.material}
                                        </div>
                                        {/* Description */}
                                        <div className="text-primary-200 text-sm truncate">
                                            {part.description}
                                        </div>
                                        {/* Location & Stock */}
                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-info/20 text-accent-info">
                                                <MapPin className="w-3 h-3" />
                                                {part.location_code || 'Unassigned'}
                                            </span>
                                            <span className={part.stock > 0 ? 'text-accent-success' : 'text-accent-danger'}>
                                                Stock: {part.stock}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchBar;
