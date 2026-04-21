import { forwardRef } from 'react';
import Barcode from 'react-barcode';

const SIZE_PRESETS = {
    default: {
        width: 360,
        minHeight: 252,
        paddingX: 24,
        headerHeight: 60,
        footerHeight: 16,
        descriptionFontSize: 18,
        quantityFontSize: 16,
        skuFontSize: 44,
        footerFontSize: 12,
        footerCountryFontSize: 11,
        barcodeHeight: 72,
        barcodeWidth: 1.6,
        brandFontSize: 10,
        headerFontSize: 15,
    },
    compact: {
        width: 292,
        minHeight: 208,
        paddingX: 18,
        headerHeight: 48,
        footerHeight: 12,
        descriptionFontSize: 14,
        quantityFontSize: 13,
        skuFontSize: 32,
        footerFontSize: 10,
        footerCountryFontSize: 9,
        barcodeHeight: 54,
        barcodeWidth: 1.15,
        brandFontSize: 8,
        headerFontSize: 12,
    },
};

function MitsubishiMark({ size = 28 }) {
    const diamondStyle = {
        position: 'absolute',
        width: size * 0.34,
        height: size * 0.34,
        background: '#d81724',
        transform: 'rotate(45deg)',
    };

    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <span style={{ ...diamondStyle, left: '50%', top: 0, marginLeft: -(size * 0.17) }} />
            <span style={{ ...diamondStyle, left: 0, top: size * 0.34 }} />
            <span style={{ ...diamondStyle, right: 0, top: size * 0.34 }} />
        </div>
    );
}

function formatLabelDescription(value) {
    return String(value || 'UNSPECIFIED PART')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

const MitsubishiGenuinePartsLabel = forwardRef(({
    product,
    quantity = 1,
    footerCode = 'WK21',
    countryOfOrigin = 'MADE IN THAILAND',
    size = 'default',
    className = '',
}, ref) => {
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.default;
    const description = formatLabelDescription(product?.name);
    const sku = String(product?.sku || 'UNKNOWN').trim().toUpperCase();

    return (
        <div
            ref={ref}
            data-product-label-root="true"
            className={className}
            style={{
                width: '100%',
                maxWidth: `${preset.width}px`,
                minHeight: `${preset.minHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                background: '#fbfbfb',
                color: '#05070b',
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid #141922',
                boxShadow: '0 22px 60px rgba(6, 10, 18, 0.26)',
                fontFamily: '"Arial Narrow", Arial, sans-serif',
            }}
        >
            <div
                style={{
                    minHeight: `${preset.headerHeight}px`,
                    background: '#06090f',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${Math.round(preset.paddingX * 0.5)}px ${preset.paddingX}px ${Math.round(preset.paddingX * 0.38)}px`,
                    gap: '16px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MitsubishiMark size={size === 'compact' ? 24 : 30} />
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            letterSpacing: '0.08em',
                            fontSize: `${preset.brandFontSize}px`,
                            lineHeight: 1.05,
                            fontWeight: 800,
                        }}
                    >
                        <span>MITSUBISHI</span>
                        <span>MOTORS</span>
                    </div>
                </div>

                <div
                    style={{
                        fontSize: `${preset.headerFontSize}px`,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                    }}
                >
                    GENUINE PARTS
                </div>
            </div>

            <div style={{ height: '4px', background: '#d81724' }} />

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: `${Math.round(preset.paddingX * 0.72)}px ${preset.paddingX}px 0`,
                    background: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}
                >
                    <div
                        style={{
                            fontSize: `${preset.descriptionFontSize}px`,
                            fontWeight: 800,
                            letterSpacing: '0.02em',
                            lineHeight: 1.1,
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                        title={description}
                    >
                        {description}
                    </div>

                    <div
                        style={{
                            fontSize: `${preset.quantityFontSize}px`,
                            fontWeight: 800,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        QTY: {quantity}
                    </div>
                </div>

                <div
                    style={{
                        marginTop: size === 'compact' ? '12px' : '16px',
                        textAlign: 'center',
                        fontSize: `${preset.skuFontSize}px`,
                        lineHeight: 0.95,
                        fontWeight: 900,
                        letterSpacing: size === 'compact' ? '0.04em' : '0.05em',
                    }}
                >
                    {sku}
                </div>

                <div
                    style={{
                        marginTop: size === 'compact' ? '10px' : '12px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: `${preset.barcodeHeight}px`,
                    }}
                >
                    <Barcode
                        value={sku}
                        format="CODE128"
                        width={preset.barcodeWidth}
                        height={preset.barcodeHeight}
                        fontSize={0}
                        margin={0}
                        displayValue={false}
                        background="transparent"
                        lineColor="#06090f"
                    />
                </div>

                <div
                    style={{
                        marginTop: 'auto',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        paddingBottom: size === 'compact' ? '10px' : '12px',
                        gap: '12px',
                    }}
                >
                    <span
                        style={{
                            fontSize: `${preset.footerFontSize}px`,
                            fontWeight: 900,
                            letterSpacing: '0.12em',
                        }}
                    >
                        {footerCode}
                    </span>
                    <span
                        style={{
                            fontSize: `${preset.footerCountryFontSize}px`,
                            fontWeight: 800,
                            letterSpacing: '0.14em',
                            textAlign: 'right',
                        }}
                    >
                        {countryOfOrigin}
                    </span>
                </div>
            </div>

            <div style={{ minHeight: `${preset.footerHeight}px`, background: '#06090f' }} />
        </div>
    );
});

MitsubishiGenuinePartsLabel.displayName = 'MitsubishiGenuinePartsLabel';

export default MitsubishiGenuinePartsLabel;
