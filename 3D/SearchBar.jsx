import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin, Package } from 'lucide-react';
import api from '../../api';

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

        // Clear previous timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Set new timer
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
                setSelectedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : prev
                );
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
        <div ref={searchRef} style={{ position: 'relative', width: '100%', maxWidth: 500 }}>
            <div style={{ position: 'relative' }}>
                <Search
                    size={20}
                    style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        pointerEvents: 'none'
                    }}
                />
                <input
                    type="text"
                    className="form-input"
                    placeholder="Search by Part Number (Material Code) or scan barcode..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    style={{
                        paddingLeft: 42,
                        paddingRight: query ? 42 : 12,
                        fontSize: 14,
                        height: 44,
                        borderRadius: 8,
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        color: '#fff'
                    }}
                />
                {query && (
                    <button
                        onClick={clearSearch}
                        style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#1e293b',
                    border: '1px solid #374151',
                    borderRadius: 8,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    maxHeight: 400,
                    overflowY: 'auto',
                    zIndex: 10000
                }}>
                    {isLoading ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                            Searching...
                        </div>
                    ) : results.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                            No parts found for "{query}"
                        </div>
                    ) : (
                        results.map((part, index) => (
                            <div
                                key={part.id}
                                onClick={() => handleSelectPart(part)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                style={{
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    background: selectedIndex === index ? '#374151' : 'transparent',
                                    borderBottom: index < results.length - 1 ? '1px solid #334155' : 'none',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 6,
                                        background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Package size={18} color="white" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Material Code as PRIMARY - large and prominent */}
                                        <div style={{
                                            color: '#fbbf24',
                                            fontWeight: 700,
                                            fontSize: 16,
                                            marginBottom: 4,
                                            fontFamily: 'monospace',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {part.material}
                                        </div>
                                        {/* Description as secondary info */}
                                        <div style={{
                                            color: '#e5e7eb',
                                            fontWeight: 400,
                                            fontSize: 13,
                                            marginBottom: 4,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {part.description}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                padding: '2px 6px',
                                                background: 'rgba(37, 99, 235, 0.2)',
                                                color: '#60a5fa',
                                                borderRadius: 4
                                            }}>
                                                <MapPin size={12} />
                                                {part.location_code || 'Unassigned'}
                                            </span>
                                            <span style={{ color: part.stock > 0 ? '#22c55e' : '#ef4444' }}>
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
