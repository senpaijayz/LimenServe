import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import usePublicVehicleSelection from '../hooks/usePublicVehicleSelection';

function wrapper({ children }) {
    return <MemoryRouter>{children}</MemoryRouter>;
}

describe('public vehicle preference cookie', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.cookie = 'limen_public_vehicle=; Max-Age=0; Path=/; SameSite=Lax';
    });

    it('persists non-sensitive fitment context without writing plate data', () => {
        const { result } = renderHook(() => usePublicVehicleSelection(), { wrapper });

        act(() => {
            result.current.updateVehicle({ model: 'Montero Sport', year: '2022', plateNo: 'ABC-1234' });
        });

        expect(document.cookie).toContain('limen_public_vehicle=');
        expect(decodeURIComponent(document.cookie.split('limen_public_vehicle=')[1])).toContain('Montero Sport');
        expect(decodeURIComponent(document.cookie.split('limen_public_vehicle=')[1])).not.toContain('ABC-1234');
    });
});
