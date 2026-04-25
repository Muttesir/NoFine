import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the 'dropoff_confirm' notification category with Yes/No action buttons.
 * opensAppToForeground: false → buttons respond in background without opening the app.
 * Call once on app startup.
 */
export const setupNotificationCategories = async (): Promise<void> => {
  await Notifications.setNotificationCategoryAsync('dropoff_confirm', [
    {
      identifier: 'YES',
      buttonTitle: 'Yes — Record Charge',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'NO',
      buttonTitle: 'No — Not a drop-off',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
};

export const NotificationService = {
  requestPermission: async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },
};


