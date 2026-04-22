import { forwardRef } from 'react';
import Barcode from 'react-barcode';
import mitsubishiLogo from '../../../assets/branding/mitsubishi-motors-logo.svg';
import { buildProductBarcodeValue } from '../../../utils/barcode';

const SIZE_PRESETS = {
    default: {
        width: 360,
        minHeight: 250,
        paddingX: 18,
        headerPaddingTop: 16,
        headerGap: 14,
        logoWidth: 172,
        badgeMinWidth: 156,
        badgeTopFontSize: 8.5,
        badgeMainFontSize: 16,
        badgePadding: '6px 14px 5px',
        markerFontSize: 28,
        ruleMarginTop: 12,
        bodyPaddingTop: 14,
        bodyPaddingBottom: 12,
        descriptionFontSize: 16,
        quantityFontSize: 16,
        skuFontSize: 64,
        barcodeTopMargin: 12,
        barcodeHeight: 82,
        barcodeWidth: 1.28,
        barcodeMargin: 14,
        barcodePadX: 8,
        footerTopMargin: 8,
        footerFontSize: 10.5,
        footerCountryFontSize: 10.5,
    },
    compact: {
        width: 320,
        minHeight: 224,
        paddingX: 16,
        headerPaddingTop: 14,
        headerGap: 12,
        logoWidth: 154,
        badgeMinWidth: 140,
        badgeTopFontSize: 7.5,
        badgeMainFontSize: 14,
        badgePadding: '5px 12px 4px',
        markerFontSize: 24,
        ruleMarginTop: 10,
        bodyPaddingTop: 12,
        bodyPaddingBottom: 10,
        descriptionFontSize: 14,
        quantityFontSize: 14,
        skuFontSize: 52,
        barcodeTopMargin: 10,
        barcodeHeight: 68,
        barcodeWidth: 1.02,
        barcodeMargin: 11,
        barcodePadX: 6,
        footerTopMargin: 8,
        footerFontSize: 9,
        footerCountryFontSize: 9,
    },
    dense: {
        width: 270,
        minHeight: 194,
        paddingX: 14,
        headerPaddingTop: 12,
        headerGap: 10,
        logoWidth: 132,
        badgeMinWidth: 116,
        badgeTopFontSize: 6.5,
        badgeMainFontSize: 11.5,
        badgePadding: '4px 9px 4px',
        markerFontSize: 20,
        ruleMarginTop: 8,
        bodyPaddingTop: 10,
        bodyPaddingBottom: 9,
        descriptionFontSize: 12,
        quantityFontSize: 12,
        skuFontSize: 40,
        barcodeTopMargin: 8,
        barcodeHeight: 52,
        barcodeWidth: 0.82,
        barcodeMargin: 8,
        barcodePadX: 4,
        footerTopMargin: 6,
        footerFontSize: 8,
        footerCountryFontSize: 8,
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
    const barcodeValue = buildProductBarcodeValue(sku) || sku;

    return (
        <div
            ref={ref}
            data-product-label-root="true"
            data-label-variant="mitsubishi-sticker"
            data-barcode-format="CODE39"
            data-barcode-value={barcodeValue}
            className={className}
            style={{
                width: '100%',
                maxWidth: `${preset.width}px`,
                minHeight: `${preset.minHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                color: '#111111',
                borderRadius: '4px',
                border: '1px solid #d7d8dc',
                boxShadow: '0 8px 18px rgba(13, 17, 23, 0.08)',
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
                        alignItems: 'center',
                        gap: `${preset.headerGap}px`,
                    }}
                >
                    <img
                        src={mitsubishiLogo}
                        alt="Mitsubishi Motors"
                        style={{
                            width: `${preset.logoWidth}px`,
                            height: 'auto',
                            display: 'block',
                            objectFit: 'contain',
                        }}
                    />

                    <div
                        style={{
                            minWidth: `${preset.badgeMinWidth}px`,
                            padding: preset.badgePadding,
                            border: '2px solid #d9222a',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#d9222a',
                            lineHeight: 1,
                        }}
                    >
                        <span
                            style={{
                                fontSize: `${preset.badgeTopFontSize}px`,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Mitsubishi Motors
                        </span>
                        <span
                            style={{
                                marginTop: '2px',
                                fontSize: `${preset.badgeMainFontSize}px`,
                                fontWeight: 800,
                                letterSpacing: '0.02em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Genuine Parts
                        </span>
                    </div>

                    <span
                        style={{
                            fontSize: `${preset.markerFontSize}px`,
                            lineHeight: 1,
                            fontWeight: 500,
                            alignSelf: 'center',
                            color: '#1a1a1a',
                        }}
                    >
                        R
                    </span>
                </div>

                <div
                    style={{
                        height: '2px',
                        background: '#d9222a',
                        marginTop: `${preset.ruleMarginTop}px`,
                    }}
                />
            </div>

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: `${preset.bodyPaddingTop}px ${preset.paddingX}px ${preset.bodyPaddingBottom}px`,
                    background: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '10px',
                    }}
                >
                    <div
                        title={description}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: `${preset.descriptionFontSize}px`,
                            fontWeight: 500,
                            letterSpacing: '0.08em',
                            lineHeight: 1.05,
                            color: '#2f3135',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {description}
                    </div>

                    <div
                        style={{
                            fontSize: `${preset.quantityFontSize}px`,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            whiteSpace: 'nowrap',
                            color: '#222428',
                            textTransform: 'uppercase',
                        }}
                    >
                        QTY: {quantity}
                    </div>
                </div>

                <div
                    style={{
                        marginTop: size === 'dense' ? '10px' : '12px',
                        textAlign: 'center',
                        fontSize: `${preset.skuFontSize}px`,
                        lineHeight: 0.96,
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                        color: '#131517',
                    }}
                >
                    {sku}
                </div>

                <div
                    style={{
                        marginTop: `${preset.barcodeTopMargin}px`,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: `0 ${preset.barcodePadX}px`,
                        background: '#ffffff',
                        lineHeight: 0,
                    }}
                >
                    <div
                        data-testid="product-barcode"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#ffffff',
                        }}
                    >
                        <Barcode
                            value={barcodeValue}
                            format="CODE39"
                            width={preset.barcodeWidth}
                            height={preset.barcodeHeight}
                            fontSize={0}
                            margin={preset.barcodeMargin}
                            displayValue={false}
                            background="#ffffff"
                            lineColor="#111214"
                        />
                    </div>
                </div>

                <div
                    style={{
                        marginTop: `${preset.footerTopMargin}px`,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: '10px',
                    }}
                >
                    <span
                        style={{
                            fontSize: `${preset.footerFontSize}px`,
                            fontWeight: 700,
                            letterSpacing: '0.18em',
                            color: '#202225',
                            textTransform: 'uppercase',
                        }}
                    >
                        {footerCode}
                    </span>
                    <span
                        style={{
                            fontSize: `${preset.footerCountryFontSize}px`,
                            fontWeight: 700,
                            letterSpacing: '0.18em',
                            color: '#202225',
                            textAlign: 'right',
                            textTransform: 'uppercase',
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
