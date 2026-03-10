import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * Dropdown Component
 * A styled dropdown select with search and custom rendering
 * 
 * @example
 * <Dropdown
 *   options={[{ value: 'admin', label: 'Administrator' }]}
 *   value={selectedRole}
 *   onChange={setSelectedRole}
 *   placeholder="Select role"
 * />
 */
const Dropdown = ({
    options = [],
    value,
    onChange,
    placeholder = 'Select option',
    searchable = false,
    disabled = false,
    error,
    label,
    className = '',
    renderOption,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options by search
    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Get selected option
    const selectedOption = options.find(opt => opt.value === value);

    // Handle selection
    const handleSelect = (option) => {
        onChange(option.value);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && (
                <label className="input-label mb-1.5 block">{label}</label>
            )}

            {/* Trigger */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
          w-full px-4 py-2.5 bg-white border rounded-lg text-left
          flex items-center justify-between gap-2 transition-all duration-200 shadow-sm
          ${error ? 'border-accent-danger' : 'border-primary-200'}
          ${isOpen ? 'border-accent-blue ring-1 ring-accent-blue' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-primary-50' : 'hover:border-primary-400'}
        `}
            >
                <span className={selectedOption ? 'text-primary-950 font-medium' : 'text-primary-400'}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-primary-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-50 w-full mt-1 bg-white shadow-xl rounded-lg border border-primary-200 overflow-hidden"
                    >
                        {/* Search Input */}
                        {searchable && (
                            <div className="p-2 border-b border-primary-700">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full px-3 py-2 bg-primary-50 border border-primary-200 rounded text-sm text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue"
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Options */}
                        <div className="max-h-60 overflow-y-auto py-1">
                            {filteredOptions.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-primary-500 text-center">No options found</p>
                            ) : (
                                filteredOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleSelect(option)}
                                        className={`
                      w-full px-4 py-2.5 text-left text-sm transition-colors
                      flex items-center gap-2
                      ${option.value === value
                                                ? 'bg-accent-blue/10 text-accent-blue font-medium'
                                                : 'text-primary-700 hover:bg-primary-50 hover:text-primary-950'
                                            }
                    `}
                                    >
                                        {renderOption ? renderOption(option) : option.label}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {error && <p className="input-error-text mt-1">{error}</p>}
        </div>
    );
};

export default Dropdown;
