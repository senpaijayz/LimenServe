import { forwardRef } from 'react';
import Barcode from 'react-barcode';
import mitsubishiLogo from '../../../assets/branding/mitsubishi-motors-logo.svg';

const SIZE_PRESETS = {
    default: {
        width: 360,
        minHeight: 244,
        paddingX: 22,
        headerPaddingTop: 16,
        descriptionFontSize: 17,
        quantityFontSize: 16,
        skuFontSize: 46,
        footerFontSize: 11,
        footerCountryFontSize: 11,
        barcodeHeight: 78,
        barcodeWidth: 1.9,
        logoHeight: 28,
        markerFontSize: 28,
        genuineBoxWidth: 126,
    },
    compact: {
        width: 304,
        minHeight: 214,
        paddingX: 18,
        headerPaddingTop: 14,
        descriptionFontSize: 14,
        quantityFontSize: 13,
        skuFontSize: 34,
        footerFontSize: 9,
        footerCountryFontSize: 9,
        barcodeHeight: 64,
        barcodeWidth: 1.5,
        logoHeight: 22,
        markerFontSize: 22,
        genuineBoxWidth: 110,
    },
};

function formatLabelDescription(value) {
    return String(value || 'UNSPECIFIED PART')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

const MitsubishiGenuinePartsLabel = forwardRef(({
    product,
    quantity = 1,
    footerCode = 'MA',
    countryOfOrigin = 'MADE IN JAPAN',
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
            data-label-variant="mitsubishi-sticker"
            data-barcode-value={sku}
            className={className}
            style={{
                width: '100%',
                maxWidth: `${preset.width}px`,
                minHeight: `${preset.minHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                color: '#121212',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid #d5d8dd',
                boxShadow: '0 14px 32px rgba(13, 17, 23, 0.12)',
                fontFamily: '"Arial Narrow", Arial, sans-serif',
            }}
        >
            <div
                style={{
                    padding: `${preset.headerPaddingTop}px ${preset.paddingX}px 0`,
                    background: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                        alignItems: 'start',
                        gap: size === 'compact' ? '12px' : '16px',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <img
                            src={mitsubishiLogo}
                            alt="Mitsubishi Motors"
                            style={{
                                height: `${preset.logoHeight}px`,
                                width: 'auto',
                                display: 'block',
                                objectFit: 'contain',
                            }}
                        />
                    </div>

                    <div
                        style={{
                            justifySelf: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: `${preset.genuineBoxWidth}px`,
                            minHeight: size === 'compact' ? '42px' : '48px',
                            padding: size === 'compact' ? '5px 12px 6px' : '6px 14px 8px',
                            border: '2px solid #d81724',
                            borderRadius: size === 'compact' ? '11px' : '13px',
                            color: '#d81724',
                            textAlign: 'center',
                            lineHeight: 1,
                        }}
                    >
                        <span
                            style={{
                                fontSize: size === 'compact' ? '8px' : '9px',
                                fontWeight: 800,
                                letterSpacing: '0.11em',
                            }}
                        >
                            MITSUBISHI MOTORS
                        </span>
                        <span
                            style={{
                                marginTop: size === 'compact' ? '3px' : '4px',
                                fontSize: size === 'compact' ? '16px' : '18px',
                                fontWeight: 900,
                                letterSpacing: '0.03em',
                            }}
                        >
                            GENUINE PARTS
                        </span>
                    </div>

                    <div
                        style={{
                            fontSize: `${preset.markerFontSize}px`,
                            lineHeight: 1,
                            fontWeight: 500,
                            letterSpacing: '0.03em',
                            alignSelf: 'center',
                            justifySelf: 'end',
                            color: '#23262d',
                        }}
                    >
                        R
                    </div>
                </div>

                <div style={{ height: '2px', background: '#d81724', marginTop: size === 'compact' ? '10px' : '12px' }} />
            </div>

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: `${size === 'compact' ? 16 : 18}px ${preset.paddingX}px ${size === 'compact' ? 12 : 14}px`,
                    background: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}
                >
                    <div
                        style={{
                            fontSize: `${preset.descriptionFontSize}px`,
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            lineHeight: 1.1,
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#4b5563',
                        }}
                        title={description}
                    >
                        {`#${description}`}
                    </div>

                    <div
                        style={{
                            fontSize: `${preset.quantityFontSize}px`,
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                            color: '#23262d',
                        }}
                    >
                        QTY: {quantity}
                    </div>
                </div>

                <div
                    style={{
                        marginTop: size === 'compact' ? '18px' : '22px',
                        textAlign: 'center',
                        fontSize: `${preset.skuFontSize}px`,
                        lineHeight: 0.92,
                        fontWeight: 700,
                        letterSpacing: size === 'compact' ? '0.12em' : '0.15em',
                        color: '#1f2937',
                    }}
                >
                    {sku}
                </div>

                <div
                    style={{
                        marginTop: size === 'compact' ? '18px' : '22px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: `${preset.barcodeHeight}px`,
                        padding: size === 'compact' ? '0 10px' : '0 12px',
                        lineHeight: 0,
                    }}
                >
                    <div
                        data-testid="product-barcode"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            background: '#ffffff',
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
                            background="#ffffff"
                            lineColor="#101114"
                        />
                    </div>
                </div>

                <div
                    style={{
                        marginTop: '16px',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}
                >
                    <span
                        style={{
                            fontSize: `${preset.footerFontSize}px`,
                            fontWeight: 900,
                            letterSpacing: '0.18em',
                            color: '#1f2937',
                        }}
                    >
                        {footerCode}
                    </span>
                    <span
                        style={{
                            fontSize: `${preset.footerCountryFontSize}px`,
                            fontWeight: 700,
                            letterSpacing: '0.16em',
                            textAlign: 'right',
                            color: '#23262d',
                        }}
                    >
                        {countryOfOrigin}
                    </span>
                </div>
            </div>
        </div>
    );
});

MitsubishiGenuinePartsLabel.displayName = 'MitsubishiGenuinePartsLabel';

export default MitsubishiGenuinePartsLabel;
