export function normalizeMechanicSaveResult(result = {}, fallback = {}) {
    const mechanic = result.mechanic ?? {};
    const id = mechanic.id || result.mechanicId || result.mechanic_id || fallback.id;

    if (!id) {
        return null;
    }

    const contactNumber = mechanic.contact_number ?? mechanic.contactNumber ?? fallback.contact_number ?? fallback.contactNumber ?? '';
    const shiftType = mechanic.shift_type ?? mechanic.schedule_type ?? fallback.shift_type ?? fallback.schedule_type ?? 'full_day';
    const availableDate = mechanic.available_date ?? mechanic.availableDate ?? fallback.available_date ?? fallback.availableDate ?? '';

    return {
        ...fallback,
        ...mechanic,
        id,
        contact_number: contactNumber,
        contactNumber,
        shift_type: shiftType,
        schedule_type: shiftType,
        available_date: availableDate,
        availableDate,
        photo_url: mechanic.photo_url ?? mechanic.photoUrl ?? fallback.photo_url ?? fallback.photoUrl ?? '',
        photoUrl: mechanic.photoUrl ?? mechanic.photo_url ?? fallback.photoUrl ?? fallback.photo_url ?? '',
        is_public: mechanic.is_public ?? fallback.is_public ?? true,
    };
}

export function upsertMechanicRow(rows = [], mechanic = null) {
    if (!mechanic?.id) {
        return rows;
    }

    const withoutCurrent = rows.filter((row) => row.id !== mechanic.id);
    return [...withoutCurrent, mechanic].sort((left, right) => (
        String(left.full_name || '').localeCompare(String(right.full_name || ''))
    ));
}

export function removeMechanicRow(rows = [], mechanicId = '') {
    return rows.filter((row) => row.id !== mechanicId);
}
