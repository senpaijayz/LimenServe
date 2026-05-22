import { forwardRef } from 'react';
import Barcode from 'react-barcode';

export const BARCODE_FORMAT = 'CODE128';

const SIZE_PRESETS = {
    small: {
        width: 0.95,
        height: 48,
        margin: 18,
        fontSize: 10,
        maxWidth: 260,
    },
    normal: {
        width: 1.35,
        height: 72,
        margin: 24,
        fontSize: 14,
        maxWidth: 420,
    },
    large: {
        width: 2.1,
        height: 132,
        margin: 40,
        fontSize: 18,
        maxWidth: 760,
    },
};

/**
 * Shared high-contrast product barcode renderer.
 *
 * Defaults to CODE128 because it is denser and more reliable for mixed part
 * numbers than CODE39, especially when displayed on phone or tablet screens.
 */
const BarcodeDisplay = forwardRef(({
    value,
    size = 'normal',
    format = BARCODE_FORMAT,
    displayValue = false,
    className = '',
    wrapperClassName = '',
    width,
    height,
    margin,
    fontSize,
    background = '#ffffff',
    lineColor = '#050505',
    ...props
}, ref) => {
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.normal;
    const safeValue = String(value ?? '').trim();

    if (!safeValue) {
        return null;
    }

    return (
        <div
            ref={ref}
            data-barcode-display="true"
            data-barcode-format={format}
            data-barcode-value={safeValue}
            data-barcode-size={size}
            className={wrapperClassName}
            style={{
                display: 'inline-flex',
                maxWidth: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                background,
                color: lineColor,
                lineHeight: 0,
            }}
        >
            <div
                className={className}
                style={{
                    display: 'inline-flex',
                    maxWidth: `${preset.maxWidth}px`,
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'visible',
                }}
            >
                <Barcode
                    value={safeValue}
                    format={format}
                    width={width ?? preset.width}
                    height={height ?? preset.height}
                    margin={margin ?? preset.margin}
                    fontSize={fontSize ?? preset.fontSize}
                    displayValue={displayValue}
                    background={background}
                    lineColor={lineColor}
                    style={{
                        display: 'block',
                        maxWidth: '100%',
                        height: 'auto',
                    }}
                    {...props}
                />
            </div>
        </div>
    );
});

BarcodeDisplay.displayName = 'BarcodeDisplay';

export default BarcodeDisplay;
