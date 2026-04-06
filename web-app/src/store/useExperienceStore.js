import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_RECENT_ITEMS = 8;
const MAX_RECENT_SEARCHES = 10;

function pushUnique(items, nextItem, key = 'id', max = MAX_RECENT_ITEMS) {
    const filtered = items.filter((item) => item[key] !== nextItem[key]);
    return [nextItem, ...filtered].slice(0, max);
}

const useExperienceStore = create(
    persist(
        (set) => ({
            isCommandOpen: false,
            recentItems: [],
            recentSearches: [],
            activityFeed: [],
            density: 'comfortable',
            motionLevel: 'balanced',

            setCommandOpen: (isCommandOpen) => set({ isCommandOpen }),
            toggleCommandOpen: () => set((state) => ({ isCommandOpen: !state.isCommandOpen })),

            pushRecentItem: (item) => set((state) => ({
                recentItems: pushUnique(state.recentItems, item),
            })),

            pushRecentSearch: (query) => {
                const normalizedQuery = String(query || '').trim();
                if (!normalizedQuery) {
                    return;
                }

                set((state) => ({
                    recentSearches: pushUnique(
                        state.recentSearches.map((item) => ({ id: item, value: item })),
                        { id: normalizedQuery, value: normalizedQuery },
                        'id',
                        MAX_RECENT_SEARCHES,
                    ).map((item) => item.value),
                }));
            },

            clearRecentSearches: () => set({ recentSearches: [] }),

            setActivityFeed: (activityFeed) => set({ activityFeed }),

            setDensity: (density) => set({ density }),
            setMotionLevel: (motionLevel) => set({ motionLevel }),
        }),
        {
            name: 'limen-experience',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                recentItems: state.recentItems,
                recentSearches: state.recentSearches,
                density: state.density,
                motionLevel: state.motionLevel,
            }),
        },
    ),
);

export default useExperienceStore;
