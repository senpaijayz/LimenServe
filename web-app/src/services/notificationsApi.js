import apiClient, { extractApiError } from './apiClient';

export async function getAdminNotifications({ category = '', limit = 20 } = {}) {
  try {
    const { data } = await apiClient.get('/notifications', {
      params: { category, limit },
    });

    return {
      notifications: data.notifications ?? [],
      unreadCount: Number(data.unreadCount ?? 0),
    };
  } catch (error) {
    extractApiError(error, 'Failed to load notifications.');
  }
}

export async function markNotificationRead(notificationId) {
  try {
    const { data } = await apiClient.patch(`/notifications/${notificationId}/read`);
    return data.notification ?? null;
  } catch (error) {
    extractApiError(error, 'Failed to update notification.');
  }
}

export async function markAllNotificationsRead() {
  try {
    await apiClient.patch('/notifications/read-all');
    return true;
  } catch (error) {
    extractApiError(error, 'Failed to mark notifications as read.');
  }
}

export async function dismissNotification(notificationId) {
  try {
    await apiClient.delete(`/notifications/${notificationId}`);
    return true;
  } catch (error) {
    extractApiError(error, 'Failed to dismiss notification.');
  }
}
