import React, { useEffect, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useStockroomStore } from '../store/useStockroomStoreV2';
import { getCoordinatesFromLocation } from './ShelvingSystem';

export default function StockroomCameraControls() {
    const controlsRef = useRef<any>(null);
    const { focusedLocation } = useStockroomStore();

    useEffect(() => {
        if (focusedLocation && controlsRef.current) {
            const [tx, ty, tz] = getCoordinatesFromLocation(focusedLocation);

            // Calculate a good viewing angle: slightly above and pulled back, looking towards the negative Z axis slightly
            const cx = tx + 4;
            const cy = ty + 3;
            const cz = tz + 5;

            controlsRef.current.setLookAt(cx, cy, cz, tx, ty, tz, true);
        } else if (controlsRef.current && !focusedLocation) {
            // Reset to default overview
            controlsRef.current.setLookAt(0, 15, 30, 0, 0, 0, true);
        }
    }, [focusedLocation]);

    return (
        <CameraControls
            ref={controlsRef}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
            minDistance={2}
            maxDistance={60}
            smoothTime={0.4}
            draggingSmoothTime={0.1}
        />
    );
}
